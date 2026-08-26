# BioFold 3D

**A WebMCP-native molecular workspace where people and agents explore the same live protein structure.**

BioFold turns a conventional WebGL protein viewer into a shared human–agent workbench. A person can rotate, style, select, and inspect a structure while an agent uses eight structured WebMCP tools that call the exact same application commands. Every action is visible and recorded in one activity stream.

## Highlights

- Polished 3D molecular rendering with 3Dmol.js.
- Deterministic offline fixtures for `1CRN` and `4HHB`.
- Live public mmCIF loading for other four-character IDs from RCSB PDB.
- Cartoon, stick, sphere, and line representations; chain, spectrum, and element coloring.
- Residue focus, van der Waals surface, atomic distance measurement, and mutation-context preview.
- Eight imperative WebMCP site tools with narrow JSON Schemas and cancellation support.
- Explicit scientific evidence labels: observed, calculated, heuristic, or unavailable.
- Human-mode fallback when `document.modelContext` is unavailable.

## Run locally

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`. The app loads bundled `1CRN` automatically.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The Playwright configuration uses the installed Google Chrome channel, so it does not require a separate browser download.

## WebMCP tools

| Tool | Shared capability |
|---|---|
| `load_structure` | Load a PDB ID into the visible scene |
| `get_structure_summary` | Read calculated structure counts |
| `focus_residues` | Highlight and zoom to residues |
| `set_representation` | Change render style and coloring |
| `show_surface` | Toggle the molecular surface |
| `measure_distance` | Calculate and draw atomic distance |
| `preview_mutation_context` | Map 5 Å neighbors and coarse physicochemical changes |
| `reset_workspace` | Reset the view or clear the workspace |

Example prompts in a WebMCP-capable browser:

- “Load 1CRN, summarize it, and focus chain A residue 10.”
- “Show the molecular surface at 60% opacity and use a stick representation.”
- “Measure the distance between A:1:CA and A:10:CA.”
- “Preview the local context of changing A:10 to tryptophan.”

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md). The central invariant is that React and WebMCP both call the same typed command bus; tools do not manipulate the DOM or bypass application validation.

## Deploy to Vercel

Import this repository into Vercel. `vercel.json` supplies the Vite build, SPA rewrite, origin isolation, WebMCP permissions policy, and a restricted content security policy. No secrets or server functions are required.

## Scientific limitations

BioFold is an exploratory visualization tool, not a medical or experimental decision system. The mutation preview compares coarse amino-acid properties and spatial neighbors only. It does not perform molecular dynamics, energy minimization, stability prediction, docking, pathogenicity classification, or AlphaFold inference.

## Data and acknowledgements

- Structure files are provided by the [RCSB Protein Data Bank](https://www.rcsb.org/).
- Molecular visualization uses [3Dmol.js](https://3dmol.org/), licensed BSD-3-Clause.
- Bundled PDB data retains its original public scientific provenance and identifiers.

## License

Application source code is available under the [MIT License](./LICENSE).
