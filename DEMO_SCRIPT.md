# BioFold 3D — Demo Video Script (3:00)

> Every beat below was rehearsed against the running application on 2026-09-04.
> Exact figures come from that rehearsal, not from the design docs.

## Before you hit record

Three things will break the take if you skip them.

1. **The laboratory does not auto-load a structure.** `/app/lab`, `/app/lab?pdb=4HHB`
   and the search box all leave the viewer on **"No structure"**. The only reliable
   human path is the **"Load the 1CRN demo"** button in the empty state. The script
   below opens with that button on purpose. Do not improvise a deep link on camera.
2. **There is no WebMCP status indicator in the UI.** `webmcpStatus` is tracked in the
   store but never rendered. Do not say "notice the badge says WebMCP ready" — there is
   no badge. Show the tool list in the console instead.
3. **Decide your tool count.** The app registers **13** tools and the landing page says
   "Thirteen tools". `README.md`, `SUBMISSION.md` and `contexto.md` still say eight.
   Say thirteen, and fix the docs before submitting.

Open DevTools before recording and keep the console docked to the right. You will paste
one snippet into it (see `docs/WEBMCP_TESTING.md`).

---

## 0:00–0:25 — The problem, on the landing page

**Visual:** `/` at 1440px. Let the pinned hero play, then scroll slowly through two
panels: *"Pixels don't measure ångströms"* and *"One command bus. Two kinds of hands."*

**Narration:**
> "Protein structures are where biology gets decided. But a 3D viewer is close to
> unusable for an AI agent. Screenshot automation collapses inside a WebGL canvas — a
> vision model cannot pick one atom out of a dense chain, hold a camera angle, or read a
> sub-ångström distance off a render.
>
> BioFold 3D takes the other route. It hands the agent typed tools instead of pixels."

---

## 0:25–0:45 — Into the workspace

**Visual:** Sign in, land on `/app`, click through to the laboratory.

**Narration:**
> "Real accounts, real row-level security, real private projects. The public landing
> loads with zero WebGL, zero workers and no tools registered — the laboratory is the
> only place any of that switches on."

> **Not verified:** the sign-in flow was never exercised during this rehearsal, because
> it needs your Supabase credentials. Do a full dry run of login → dashboard → lab before
> recording.

---

## 0:45–1:05 — The human loads a structure

**Visual:** In the empty viewer, click **"Load the 1CRN demo"**. Crambin appears. Point at
the HUD.

**On screen you will see:** `1 chains · 46 residues · 327 atoms`

**Narration:**
> "Here is Crambin. Cartoon representation, coloured by chain, forty-six residues. Every
> control you see — style, colour, surface, measurement — runs through one typed command
> bus. Remember that, because the agent is about to use the same one."

---

## 1:05–2:10 — The centrepiece: the agent takes the controls

**Visual:** Paste the harness from `docs/WEBMCP_TESTING.md` into the console, then run the
calls one at a time. Keep the 3D scene visible the whole time. Never cut away.

```js
mcpList()          // → 13 tool names
```

**Narration:**
> "A WebMCP browser agent discovers thirteen imperative tools registered on this live
> scene, through `document.modelContext`. Watch the viewer, not the console."

```js
await mcp("load_structure", { pdbId: "4HHB" })
```
**HUD becomes:** `4 chains · 574 residues · 4779 atoms`

```js
await mcp("set_representation", { style: "stick", colorScheme: "spectrum" })
```
**Scene chips become:** `Stick · Spectrum`

```js
await mcp("measure_distance", {
  from: { chain: "A", residueNumber: 1,  atomName: "CA" },
  to:   { chain: "A", residueNumber: 10, atomName: "CA" }
})
```
**Scene chips become:** `Stick · Spectrum · 13.29 Å`

**Narration:**
> "Hemoglobin. Four chains, five hundred and seventy-four residues. Stick representation,
> spectrum colouring, and a measured distance of thirteen point two nine ångströms
> between two named atoms.
>
> Nothing was scraped from the DOM. When the agent calls `set_representation`, it runs the
> exact TypeScript handler my click runs. One code path, one scene, one audit trail — and
> I never lost sight of the molecule."

---

## 2:10–2:35 — Evidence discipline

**Visual:** Scroll the console output so the `evidence` field is legible, then open the
**Session Audit** screen.

```js
await mcp("show_surface", { visible: true, opacity: 0.6 })
await mcp("preview_mutation_context", {
  residue: { chain: "A", residueNumber: 10 }, toAminoAcid: "TRP"
})
```

**Narration:**
> "Every result is labelled. Coordinates come back as **observed**. The distance and the
> surface are **calculated**. The mutation context is **heuristic** — it compares
> physicochemical properties of neighbouring residues. It does not simulate a mutation,
> and it says so.
>
> BioFold does not predict folding, stability, binding affinity or clinical outcomes.
> Being explicit about that is the point."

---

## 2:35–3:00 — Close

**Visual:** Session Audit with the agent's calls listed, then back to the full workspace.

**Narration:**
> "Every action — mine or the agent's — is on the record, with a timestamp, a duration and
> its evidence class. Assistant proposals stay inert until a human presses Apply, and the
> audit trail refuses to record them without explicit approval.
>
> That is BioFold 3D: not an agent that watches a screen, but one with hands — working
> beside you, on your structure, where you can check everything it did."

---

## Verified figures

| Fact | Value |
|---|---|
| Tools registered | 13 |
| 1CRN | 1 chain · 46 residues · 327 atoms |
| 4HHB | 4 chains · 574 residues · 4779 atoms |
| `measure_distance` A:1:CA ↔ A:10:CA on 4HHB | 13.29 Å |
| `measure_distance` A:1:CA ↔ A:10:CA on 1CRN | 12.60 Å |
| Evidence tiers shown | observed · calculated · heuristic |

## Rehearsal checklist

- [ ] Log in with real credentials once, end to end
- [ ] Confirm "Load the 1CRN demo" appears and works
- [ ] Paste the harness, confirm `mcpList()` returns 13
- [ ] Run the whole tool sequence once; confirm the HUD changes each time
- [ ] Reconcile the tool count across README, SUBMISSION and the landing page
