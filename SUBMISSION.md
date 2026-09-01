# BioFold 3D — WebMCP Submission

## Short Description
BioFold 3D is a WebMCP-native molecular workspace platform where researchers and browser AI agents explore, measure, and analyze live 3D protein structures together in real time.

---

## The Problem & Why WebMCP is Essential
Modern molecular visualization tools (PDB viewers, PyMOL, Chimera) are essential for structural biology, drug discovery, and biochemistry education. However, they are notoriously difficult for conventional AI agents to navigate:
1. **Visual Automation Fails in 3D:** Screenshot-based and click-coordinate automation is fragile in WebGL canvases. Vision models cannot reliably determine 3D camera angles, select specific amino acid atoms across dense polypeptide chains, or verify sub-ångström distances from pixels.
2. **Disconnected Scientific Backends:** Running a headless Python script or external API breaks the human researcher's visual context. The scientist is left looking at static tables instead of the active structure.

**WebMCP solves both problems:** By embedding typed, imperative site tools directly into `document.modelContext`, BioFold gives the agent direct, high-precision control over the live molecular scene while preserving the human researcher's visual context as the single source of truth.

---

## Human + Agent Co-Exploration
In BioFold 3D, humans and AI agents are first-class peers:
- **Shared Command Bus:** When an agent invokes `set_representation` or `measure_distance`, it calls the exact same TypeScript command handler triggered when a user clicks a button or drags a slider in the HUD.
- **Real-Time Activity Audit Trail:** Every action—whether initiated by human touch or an agent tool call—is logged in a live activity stream with millisecond timestamps, execution duration, and explicit scientific evidence tags (*Observed*, *Calculated*, *Heuristic*).
- **Mutual Takeover:** A researcher can ask the agent to *"Load 1CRN and highlight residue 10"*, and then immediately take manual mouse control to rotate the camera, tweak surface opacity, or inspect neighboring chains.

---

## Platform Architecture & Security
BioFold 3D is engineered as a production-grade web application:
- **Complete Auth & Workspace Suite:** Integrated with Supabase Auth (PKCE flow, Email/Password, Google OAuth, Email verification, and password recovery).
- **Public Isolation:** The public landing page (`/`) loads in milliseconds with zero WebGL, Web Worker, or WebMCP overhead.
- **Protected Routing & Session Gating:** Routes like `/app`, `/app/lab`, and `/app/account` enforce active session resolution. Deep links (`/app/lab?pdb=4HHB`) are preserved across the login flow via `?next=...` parameters.
- **Dynamic WebMCP Lifecycle:** The 8 WebMCP tools are activated only inside an authenticated `/app/lab` session and automatically clean up upon navigating away or logging out.
- **Hardware-Accelerated 3D & Dedicated Workers:** Built on `3Dmol.js` with background Web Workers for non-blocking surface triangulation and distance calculations.

---

## The 8 WebMCP Site Tools

1. `load_structure`: Ingests bundled fixtures (`1CRN`, `4HHB`) or downloads live mmCIF structures from RCSB PDB.
2. `get_structure_summary`: Returns calculated counts for chains, residues, atoms, ligands, and solvent waters.
3. `focus_residues`: Centers, zooms, and highlights specific residues in 3D.
4. `set_representation`: Controls cartoon, stick, sphere, and line styles alongside chain, spectrum, and element coloring.
5. `show_surface`: Computes and renders van der Waals / solvent-accessible surfaces with variable opacity.
6. `measure_distance`: Calculates precise 3D Euclidean distances in Ångströms and draws reference vectors.
7. `preview_mutation_context`: Analyzes 5 Å spatial neighbor residues and compares amino acid physicochemical properties.
8. `reset_workspace`: Re-centers the viewport or resets the active workspace.

---

## Project Links

- **Live Application:** [https://biofold-3d.vercel.app](https://biofold-3d.vercel.app) *(or your deployed Vercel URL)*
- **GitHub Repository:** [https://github.com/your-org/BioFold](https://github.com/your-org/BioFold)
- **Demo Video:** [https://youtu.be/your-demo-video](https://youtu.be/your-demo-video)
