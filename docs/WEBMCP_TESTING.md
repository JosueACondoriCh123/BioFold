# Testing the WebMCP integration

Three ways to exercise the tools, from fastest to most faithful. All of them were run
against the application on 2026-09-04; the outputs quoted here are real.

## How registration actually works

`registerBioFoldTools()` in `src/adapters/webmcp.ts` refuses to register unless **all** of
these hold:

- a user session is active (`workspaceSession` has a `userId`)
- the laboratory route is the active screen
- the 3D viewer reports `viewerReady`
- `document.modelContext.registerTool` is a function

If the last one is missing, status becomes `unavailable` and nothing is registered. That is
the normal state in a browser without WebMCP — and the reason method 1 below works at all.

The adapter **retries every 2 seconds** while status is not `ready`, and again on window
focus. So you can define `document.modelContext` at any moment and the tools appear within
about a second. You do not need to inject before page load.

---

## 1. Console harness — no special browser needed

The practical option, and the one the demo script uses. Works in ordinary Chrome.

Open the laboratory, load a structure, open DevTools, and paste:

```js
const __t = new Map();
Object.defineProperty(document, "modelContext", {
  configurable: true,
  value: {
    registerTool: (d) => {
      __t.set(d.name, d);
      return { unregister: () => __t.delete(d.name) };
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
```

That strictness is a feature worth showing: the contract an agent receives is the contract
that is enforced.

---

## 2. A real WebMCP browser (Chrome)

Verified against Chrome's own documentation on 2026-09-04.

### Enable it

1. Use **Chrome 150 or newer**. See the version note below — 149 is risky.
2. Open `chrome://flags/#enable-webmcp-testing`, set it to **Enabled**.
3. **Relaunch Chrome.** Reloading the tab is not enough; the flag only applies on restart.
4. Install the **Model Context Tool Inspector** extension from the Chrome team. There is
   **no built-in agent in Chrome** — without this extension nothing will call your tools.

The flag covers local development. The separate origin trial (Chrome 149–156, ending
2026-11-16) is what lets ordinary visitors to the deployed site use the tools; it needs a
registered origin and a trial token served by the page.

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

### Three things to verify in the real browser, because method 1 cannot catch them

The console harness stubs `document.modelContext`, so it proves the command bus works —
not that Chrome accepts our tool definitions. These are the gaps:

1. **`navigator` vs `document`.** Chrome moved the getter from `navigator.modelContext` to
   `document.modelContext`; `navigator.modelContext` is deprecated as of Chrome 150 and
   reported removed in 153 Dev. `src/adapters/webmcp.ts` reads **only**
   `document.modelContext`. On a Chrome that exposes only the navigator surface, BioFold
   registers nothing, silently. A one-line fallback closes it:

   ```ts
   modelContext = document.modelContext ?? (navigator as { modelContext?: WebMCPModelContext }).modelContext
   ```

2. **Annotation vocabulary.** We send the MCP server-side set — `readOnlyHint`,
   `destructiveHint`, `idempotentHint`, `openWorldHint`. Chrome's imperative API documents
   `readOnlyHint`, `untrustedContentHint` and `consequentialHint`. Our destructive tools
   (`reset_workspace`) therefore may not be flagged as consequential, which is what would
   normally make the browser ask the user first. Check whether Chrome prompts.

3. **Return shape.** Chrome documents `execute` as returning a string (or null on
   navigation). Our tools return a `CommandResult` object with `ok`, `data`, `evidence`,
   `provenance` and `activityId`. Confirm the agent receives something usable rather than
   `[object Object]`.

None of these can fail in the console harness, because the harness is the thing being
mocked. They can only fail in a real browser.

## 3. Automated tests

Already in the repository, and the cheapest regression net:

```bash
npx vitest run tests/workspaceLifecycle.test.ts
npx vitest run tests/commandContracts.test.ts
npx vitest run tests/assistantEdgeContracts.test.ts
```

These inject a fake `modelContext` the same way method 1 does, and assert registration
lifetime, de-registration on exit, rejection of stale definitions, and that the contracts
never drift.

---

## Known gaps as of 2026-09-04

- **The laboratory does not auto-load a structure.** `/app/lab`, `/app/lab?pdb=4HHB` and
  the search box all leave the viewer on "No structure". Only the "Load the 1CRN demo"
  button works. Ironically `load_structure` through WebMCP works fine for both `1CRN` and
  `4HHB` — the agent can load a structure the human interface currently cannot.
- **No WebMCP status is rendered.** `webmcpStatus` lives in the store and reaches no
  component. There is nothing on screen telling a user whether tools are registered.
- **Tool count is inconsistent across the repo.** The app and the landing page say 13;
  `README.md`, `SUBMISSION.md` and `contexto.md` still say eight.
