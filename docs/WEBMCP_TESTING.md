# Testing the WebMCP integration

Three ways to exercise the tools: a console harness, Chrome's native API, and automated
regressions. The console examples below are recorded observations; automated native
coverage is described in section 3. An emulated browser API does not prove Chrome compatibility.

## How registration actually works

`registerBioFoldTools()` in `src/adapters/webmcp.ts` refuses to register unless **all** of
these hold:

- a user session is active (`workspaceSession` has a `userId`)
- the laboratory route is the active screen
- the 3D viewer reports `viewerReady`
- `document.modelContext.registerTool` is a function (or the legacy `navigator.modelContext` API)

If the last one is missing, status becomes `unavailable` and nothing is registered. That is
the normal state in a browser without WebMCP — and the reason method 1 below works at all.

The adapter **retries every 2 seconds** while status is not `ready`, and again on window
focus. So you can define `document.modelContext` at any moment and the tools appear within
two seconds. You do not need to inject before page load. The header shows the registration
count; open its WebMCP indicator for setup instructions, registration errors and a retry button.

---

## 1. Console harness — no special browser needed

The practical option, and the one the demo script uses. Works in ordinary Chrome.

Use this only in a browser without native WebMCP. Open the laboratory, load a structure,
open DevTools, and paste:

```js
const __t = new Map();
if (document.modelContext || navigator.modelContext) throw new Error("Use the native API instead of replacing it.");
Object.defineProperty(document, "modelContext", {
  configurable: true,
  value: {
    registerTool: (d, { signal } = {}) => {
      if (signal?.aborted) return;
      if (__t.has(d.name)) throw new Error(`Duplicate tool: ${d.name}`);
      __t.set(d.name, d);
      signal?.addEventListener("abort", () => __t.delete(d.name), { once: true });
    },
  },
});
window.mcp = (name, input = {}) => __t.get(name).execute(input, {});
window.mcpList = () => [...__t.keys()];
window.mcpSchema = (name) => __t.get(name).inputSchema;
```

Wait about two seconds, then:

```js
mcpList()
// → 13 names: load_structure, get_structure_summary, focus_residues,
//   set_representation, show_surface, measure_distance, preview_mutation_context,
//   reset_workspace, export_publication_figure, annotate_active_site,
//   query_uniprot_annotations, compare_structures_rmsd, save_project_snapshot
```

This is not a mock of BioFold. It is a mock of *the browser*. The tool definitions, the
command bus, the viewer and the audit trail are all the real thing — you are standing in
for the agent runtime, nothing else.

### Verified calls

```js
await mcp("load_structure", { pdbId: "4HHB" })
// ok:true · evidence:"observed" · HUD → 4 chains · 574 residues · 4779 atoms

await mcp("get_structure_summary")
// ok:true · evidence:"calculated"
// data: { chainCount: 4, residueCount: 574, atomCount: 4779, ligandCount, waterCount }

await mcp("set_representation", { style: "stick", colorScheme: "spectrum" })
// ok:true · evidence:"observed" · scene chips → Stick · Spectrum

await mcp("measure_distance", {
  from: { chain: "A", residueNumber: 1,  atomName: "CA" },
  to:   { chain: "A", residueNumber: 10, atomName: "CA" }
})
// ok:true · evidence:"calculated" · 13.29 Å on 4HHB, 12.60 Å on 1CRN

await mcp("show_surface", { visible: true, opacity: 0.6 })
// ok:true · evidence:"calculated" · scene chips → Surface · 60%

await mcp("preview_mutation_context", {
  residue: { chain: "A", residueNumber: 10 }, toAminoAcid: "TRP"
})
// ok:true · evidence:"heuristic"

await mcp("focus_residues", { residues: [{ chain: "A", residueNumber: 10 }] })
// ok:true · evidence:"observed"
```

### Getting the input shape right

Schemas are strict and reject unknown properties, so guessing fails loudly:

```js
await mcp("preview_mutation_context", { chain: "A", residueNumber: 10, mutantResidue: "TRP" })
// ok:false · INVALID_INPUT · "Tool input contains unsupported properties:
//   chain, residueNumber, mutantResidue."
```

Read the real schema instead of guessing:

```js
mcpSchema("preview_mutation_context")
// Every tool now includes a copyable example at inputSchema.examples[0].
copy(JSON.stringify(mcpSchema("preview_mutation_context").examples[0], null, 2))
```

Chrome's manual form may prefill strings with the literal value `example_string`. That is a
schema placeholder, not molecular data. Replace it with values from the loaded structure:

```json
{
  "pdbId": "1CRN",
  "residues": [{ "chain": "A", "residueNumber": 10 }],
  "from": { "chain": "A", "residueNumber": 1, "atomName": "CA" },
  "to": { "chain": "A", "residueNumber": 10, "atomName": "CA" }
}
```

Use only the property group for the chosen tool. Do not include `insertionCode` unless the
actual residue has one. The contracts reject placeholders and report the precise invalid field.

The UniProt command returns a `highlightStatus` and explanatory `message`. A zero count can
mean highlighting was disabled, another structure is loaded, the entry has no supported
features, or its sequence numbering does not match the loaded model. A failed retrieval is an
error instead of a misleading successful result with zero annotations.

The durable `project_events_command_audited` constraint must contain the same command names as
`COMMAND_NAMES`. Migration `20260904175859_expand_project_event_commands.sql` expands it from
the original eight to all thirteen. Its regression test prevents the lists from drifting again.

---

## 2. A real WebMCP browser (Chrome)

Verified against Chrome's own documentation on 2026-09-04.

### Enable it

1. Use a current **Chrome 150 or newer**. Native tests target the current document API.
2. Open `chrome://flags/#enable-webmcp-testing`, set it to **Enabled**.
3. **Relaunch Chrome.** Reloading the tab is not enough; the flag only applies on restart.
4. For manual calls, use **DevTools → Application → WebMCP**. If that pane is absent,
   also enable `chrome://flags/#devtools-webmcp-support` and relaunch. For natural-language
   agent chat, install the Chrome team's **Model Context Tool Inspector** extension.

The flag enables local testing. Availability for visitors without the flag requires
Chrome's [origin trial](https://developer.chrome.com/docs/ai/webmcp) and a valid token for
the deployed origin. Registering tools does not start an AI agent by itself.

### Check the API is actually there

```js
typeof document.modelContext?.registerTool   // → "function"
```

If it is `undefined`, one of these is true: the flag is off, Chrome was not relaunched,
the page is not in a secure context, or the document is not origin-isolated.

- **Secure context.** `https://` and `localhost` / `127.0.0.1` qualify. Plain `http://`
  on any other host does not — so `http://127.0.0.1:4173` is fine for the demo.
- **Origin isolation.** The API is disabled when `Origin-Agent-Cluster: ?0` is set, and it
  is gated by the `tools` Permissions Policy, which defaults to `self`.

### Then

Open `/app/lab`, load a structure, and prompt the Inspector extension in natural language:

> "Load 4HHB, switch to stick with spectrum colouring, and measure the distance from
> A:1:CA to A:10:CA."

Also confirm the lifecycle: navigating away from `/app/lab` must de-register every tool,
and a Chrome **without** the flag must degrade silently to human-only mode.

### Step-by-step walkthrough

Each step has a checkpoint. If a checkpoint fails, stop there — the later steps cannot work.

**1 · Check your Chrome version.** Open `chrome://version`. Use current Chrome;
the native tests have been exercised with **152.0.7977.76**. Early previews expose the getter
on `navigator`; the adapter falls back to that API, including legacy `unregisterTool` cleanup.

> Checkpoint: an up-to-date Chrome is installed.

**2 · Turn on the flag.** Open `chrome://flags/#enable-webmcp-testing`, set it to
**Enabled**, then click **Relaunch**. Reloading the tab does nothing.

> Checkpoint: after relaunch, the flag still reads Enabled.

**3 · Install the Tool Inspector.** From the
[Chrome Web Store](https://chromewebstore.google.com/detail/gbpdfapgefenggkahomfgkhfehlcenpd),
or unpacked from [beaufortfrancois/model-context-tool-inspector](https://github.com/beaufortfrancois/model-context-tool-inspector).
Pin it to the toolbar. It can run tools **manually**, which is the demo-safe path — it does
not depend on Gemini being available to you.

> Checkpoint: the extension icon is visible in the toolbar.

**4 · Serve the laboratory.** Two options.

*Fastest — no login.* The isolated fixture bypasses Supabase auth entirely and still
satisfies the registration gates:

```bash
npx vite build --config vite.e2e.config.ts && npx vite preview --config vite.e2e.config.ts
```

Then open `http://127.0.0.1:4191/app/lab`.

*Real app.* `pnpm dev`, open `http://127.0.0.1:4173`, sign in, navigate to the laboratory.
Registration needs an authenticated session, so there is no shortcut here.

Either way the origin is `127.0.0.1`, which counts as a secure context.

> Checkpoint: the laboratory renders with a 3D canvas.

**5 · Load a structure.** If a saved workspace opens empty, click **"Load the 1CRN demo"**
or invoke `load_structure` with `{ "pdbId": "1CRN" }`. Tools register as soon as the viewer
is ready, including when no structure is loaded yet.

> Checkpoint: the HUD reads `1 chains · 46 residues · 327 atoms`.

**6 · Confirm the browser API is present.** In DevTools:

```js
typeof document.modelContext?.registerTool   // → "function"
typeof navigator.modelContext                // legacy API; absent in the tested Chrome 152
```

> Checkpoint: the first line prints `"function"`. If it prints `"undefined"`, go back to
> step 2. If the *second* line prints `"object"` while the first prints `"undefined"`,
> the adapter will use that legacy API. Upgrade Chrome for the current discovery and
> execution methods used below.

**7 · Confirm BioFold registered.** Open the Tool Inspector panel.

> Checkpoint: **13 tools** listed, including `load_structure` and `save_project_snapshot`.
> Chrome's `getTools()` sorts names alphabetically. If step 6 passed but the panel is empty, the gates in
> `registerBioFoldTools()` rejected the call — check that you are signed in, that the
> route is `/app/lab`, and that the viewer finished booting. The adapter retries every
> 2 seconds, so give it a moment before concluding anything.

**8 · Run a tool manually.** In the Inspector, pick `set_representation` and execute
`{ "style": "stick", "colorScheme": "spectrum" }`.

> Checkpoint: the scene chips in the viewer change to `Stick · Spectrum`. That is the
> whole thesis in one action — the agent's call moved the human's scene.

**9 · Then use natural language**, if the Inspector's Gemini mode is available to you:

> "Load 4HHB, switch to stick with spectrum colouring, and measure the distance from
> A:1:CA to A:10:CA."

> Checkpoint: HUD reads `4 chains · 574 residues · 4779 atoms` and a `13.29 Å` chip
> appears.

**10 · Check the lifecycle.** Navigate away from `/app/lab`.

> Checkpoint: the Inspector's tool list empties. Navigate back and it repopulates.

### Native discovery and execution from DevTools

No console harness or extension is needed for these native calls:

```js
const tools = await document.modelContext.getTools();
console.table(tools.map(({ name, description }) => ({ name, description })));
const load = tools.find(tool => tool.name === "load_structure");
JSON.parse(await document.modelContext.executeTool(load, JSON.stringify({ pdbId: "1CRN" })));
const summary = tools.find(tool => tool.name === "get_structure_summary");
JSON.parse(await document.modelContext.executeTool(summary, "{}"));
```

The browser serializes BioFold's `CommandResult` to JSON, including `ok`, `data`, `error`,
`evidence`, `provenance` and `activityId`. Do not serialize again inside the adapter.

The adapter translates shared command metadata into the browser's `readOnlyHint`,
`untrustedContentHint` and `consequentialHint` annotations. UniProt queries are marked
mutable because they can highlight residues. External annotations and user notes are
marked as untrusted content. Chrome 152 exposes the first two hints via `getTools()`;
it does not expose `consequentialHint` in that result, so do not rely on hints for authorization.

Registration removal uses an `AbortSignal` in current Chrome and `unregisterTool` when
available in older versions. Command execution keeps its separate cancellation signal
and workspace generation gate. Leaving the lab, logging out, or hot-reloading the adapter
removes registrations.

References: [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api),
[DevTools WebMCP panel](https://developer.chrome.com/docs/devtools/application/webmcp).

## 3. Automated tests

Fast regression coverage (emulated browser context):

```bash
pnpm exec vitest run tests/webmcp.test.ts tests/workspaceLifecycle.test.ts tests/commandContracts.test.ts
```

These cover current/legacy discovery, registration retries, browser errors, cancellation,
session gates and rejection of stale definitions.

Native Chrome integration (requires Chrome installed):

```bash
pnpm test:webmcp
```

`playwright.webmcp.config.ts` builds the isolated laboratory fixture and launches Chrome
with WebMCP enabled. `tests/e2e/webmcpNative.spec.ts` uses the real `getTools()` and
`executeTool()` methods without replacing `modelContext`. It exercises all 13 tools,
JSON results, audit entries, errors and removal on navigation/logout. Authentication is
simulated; molecular input uses fixtures. This does not validate a production login,
live external scientific services, cloud persistence, an origin-trial token or an LLM's tool choices.

`tests/e2e/webmcpUnavailable.spec.ts` launches Chrome with WebMCP disabled and checks
manual structure loading, connection help and the help panel on desktop and mobile.

Verified on 2026-09-04: **22 unit tests and 4 Chrome integration tests passed**, with
Chrome 152.0.7977.76. TypeScript, targeted ESLint and the production build also passed.

---

## Scope notes

- A saved project can open with no structure. The native test deliberately loads one
  through WebMCP, as an agent would.
- `save_project_snapshot` currently writes a local browser snapshot. Cloud project
  persistence uses the existing laboratory project integration and is tested separately.
- Legacy smoke suites include older UI selectors and eight-tool expectations. Use the
  dedicated native suite above to verify the current 13-tool Chrome integration.
