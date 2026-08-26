# BioFold 3D demo script — 2:40 target

## 0:00–0:20 — Problem

“Protein viewers contain precise scientific data, but they demand precise UI operations. BioFold gives people and agents a shared molecular workspace instead of asking an agent to guess where to click.”

Show the loaded `1CRN` structure, the WebMCP-ready badge, and the shared activity stream.

## 0:20–0:55 — Discover and load

Prompt: **“Load 1CRN and summarize the structure.”**

Show that the viewer changes and the inspector reports chains, residues, atoms, ligands, and waters. Point out the fixture provenance and the agent entry in the activity stream.

## 0:55–1:30 — Collaborate in the same scene

Prompt: **“Use a stick representation, focus chain A residue 10, and label it.”**

Rotate the model manually after the agent focuses it. Explain that both manual controls and tools call the same command bus.

## 1:30–1:55 — Precise calculation

Prompt: **“Measure A:1:CA to A:10:CA.”**

Show the magenta line, Ångström label, calculated evidence level, and activity result.

## 1:55–2:25 — Honest mutation context

Prompt: **“Preview changing chain A residue 10 to tryptophan.”**

Show the amber target, turquoise neighbors, and charge/size/hydrophobicity comparison. State clearly: “This is context and a labeled heuristic, not a folding or stability prediction.”

## 2:25–2:40 — Close

Toggle the molecular surface and finish:

“WebMCP lets the agent perform exact molecular operations while the person keeps visual control, scientific provenance, and a complete audit trail.”
