# BioFold 3D

**A WebMCP-native molecular workspace platform where people and AI agents explore the same live protein structures.**

BioFold 3D bridges the gap between molecular visualization and autonomous agentic workflows. Built as a full web platform with secure user authentication, responsive workspace navigation, and an interactive 3D laboratory, BioFold enables researchers and browser agents to rotate, style, select, measure, and analyze proteins cooperatively in real time. Every action performed by either a human or an agent flows through a unified command bus and is recorded with scientific provenance in a live activity stream.

---

## Key Features

### 1. Platform & User Experience
- **Lightweight Public Landing (`/`):** Fast, accessible overview of platform capabilities and structure previews with **zero WebGL or WebMCP overhead** until entering the laboratory.
- **Real Supabase Authentication:** Secure session management with PKCE flow, Email & Password, Google OAuth, email verification, and password recovery.
- **Workspace Navigation:** Private application suite with home dashboard (`/app`), 3D laboratory (`/app/lab`), and account profile settings (`/app/account`).
- **Protected Routing & Deep Links:** Automatic redirection of unauthenticated access to `/login?next=...`, preserving structure queries (e.g. `?pdb=4HHB`) upon sign-in.
- **Scene Preservation:** Molecular scene and camera state remain active in memory when navigating between workspace tabs and only teardown upon explicit logout.

### 2. Interactive 3D Molecular Laboratory
- **High-Performance 3Dmol.js Viewer:** Hardware-accelerated WebGL molecular graphics with cartoon, stick, sphere, and line representations.
- **Scientific Color Schemes:** Chain-based, residue spectrum, and element-based coloring.
- **Molecular Surfaces & Geometry:** Van der Waals molecular surface computation with real-time opacity controls and non-blocking worker threads.
- **Atomic Distance & Neighborhoods:** Sub-ångström distance measurements with 3D dashed vectors and 5 Å spatial neighbor mapping.
- **Deterministic Offline Fixtures & RCSB PDB Ingestion:** Bundled offline structures (`1CRN`, `4HHB`) and on-demand live fetching of valid 4-character mmCIF records from RCSB.

### 3. Agentic WebMCP Integration
- **Eight Imperative WebMCP Tools:** Dynamically registered via `document.modelContext.registerTool` strictly when an authenticated user opens `/app/lab`.
- **Single Command Bus:** Human UI controls and agent tools call the exact same typed domain commands—no DOM scraping or backdoor state mutation.
- **Explicit Scientific Evidence Labels:** Every output is tagged as *Observed* (PDB coordinates), *Calculated* (geometric measurements), *Heuristic* (physicochemical mutation comparisons), or *Unavailable*.
- **Lifecycle & Cancellation:** WebMCP tools automatically de-register when leaving the lab, clean up worker jobs on abort signals, and gracefully fall back to human-only mode in standard browsers.

---

## Step-by-Step Installation & Setup

### Prerequisites
- **Node.js:** v22.12.0 or higher (the installed Supabase SDK no longer supports Node 20)
- **Package Manager:** `pnpm` 11.19.0 (see `packageManager` in `package.json`)
- **Browser:** Google Chrome (v130+ with WebMCP enabled for AI agent interaction)

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/BioFold.git
cd BioFold
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment Variables
BioFold connects to Supabase Auth on the client side using public credentials.

Copy the example environment template:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your public Supabase project settings:
```dotenv
# Your Supabase Project URL (https://<project-ref>.supabase.co)
VITE_SUPABASE_URL=https://your-project.supabase.co

# Your Supabase Public Publishable Key (sb_publishable_... or legacy public anon JWT)
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_public_key_here
```

> [!NOTE]
> Use real public project values for normal development. Without them, accounts remain explicitly unavailable; there is no guest or mock login. Automated QA builds its own isolated configuration and never reads `.env` or `.env.local`. Never put secret keys (`service_role`, database passwords) in `VITE_*` variables. See [Auth setup](docs/AUTH_SETUP.md) for callbacks, Google and SMTP.

### 4. Start the Local Development Server
```bash
pnpm dev
```

The application will start at **`http://127.0.0.1:4173`**.

Open your browser to `http://127.0.0.1:4173`:
- Visit the public landing at `/`.
- Sign in at `/login` or create an account at `/signup`.
- Explore your dashboard at `/app` or enter the 3D viewer directly at `/app/lab`.

---

## Application Route Map

| Route | Access | Description |
|---|---|---|
| `/` | Public | Public landing page with features, structure gallery preview, and call-to-actions. No WebGL initialized. |
| `/login` | Public | Sign in form with Email/Password, Google OAuth, and navigation to registration and recovery. |
| `/signup` | Public | New account registration with client validation and verification email dispatch. |
| `/verify-email` | Public | Email verification instructions and option to resend confirmation emails. |
| `/forgot-password` | Public | Password recovery request form. |
| `/reset-password` | Guarded | Set new password form; only accessible via verified recovery tokens. |
| `/auth/callback` | Public | PKCE and OAuth exchange handler that redirects to target destinations. |
| `/app` | Authenticated | User dashboard with personalized greetings, quick guides, and 1-click structure loaders. |
| `/app/lab` | Authenticated | Live 3D molecular laboratory with 3Dmol viewer, scene controls, and WebMCP agent tools. |
| `/app/account` | Authenticated | Profile details (name update in Supabase `user_metadata`), security notes, and sign out. |
| `*` | Public | 404 page with quick link back to safe ground. |

---

## WebMCP Tools Reference

When a compatible AI agent connects to BioFold inside `/app/lab`, the following 8 tools become available in `document.modelContext`:

| Tool Name | Parameters | Description | Evidence Level |
|---|---|---|---|
| `load_structure` | `pdbId` (string, 4 chars) | Loads a structure into the live 3D viewer. Supports bundled fixtures (`1CRN`, `4HHB`) and RCSB downloads. | Observed |
| `get_structure_summary` | None | Returns calculated counts for chains, residues, atoms, ligands, and waters. | Calculated |
| `focus_residues` | `chain` (string), `residueNumber` (number), `label` (boolean) | Centers and zooms the camera onto a specific residue and highlights its sidechain. | Observed |
| `set_representation` | `style` (`cartoon` \| `stick` \| `sphere` \| `line`), `colorScheme` (`chain` \| `spectrum` \| `element`) | Changes the 3D rendering representation and color palette. | Calculated |
| `show_surface` | `visible` (boolean), `opacity` (number 0.1–1.0) | Computes and displays the molecular solvent-accessible / van der Waals surface in a background worker. | Calculated |
| `measure_distance` | `from` (`chain`, `residueNumber`, `atomName`), `to` (`chain`, `residueNumber`, `atomName`) | Computes 3D Euclidean distance in Ångströms and renders a visual reference vector. | Calculated |
| `preview_mutation_context` | `residue` (`chain`, `residueNumber`), `toAminoAcid` (1-letter code) | Maps all 5 Å spatial neighbor residues and compares physicochemical properties (charge, hydropathy, volume). | Heuristic |
| `reset_workspace` | `scope` (`view` \| `all`) | Resets camera position, clears selections and measurements, or resets the active workspace. | Calculated |

### Example Prompts for Browser Agents
- *“Load protein 1CRN and give me a summary of its chains and residue count.”*
- *“Change the view to cartoon with spectrum colors and show the molecular surface at 50% opacity.”*
- *“Measure the distance between chain A residue 1 CA and chain A residue 10 CA.”*
- *“Focus on chain A residue 25, and preview the spatial context if it were mutated to Tyrosine.”*

---

## Quality Assurance & Automated Verification

BioFold maintains a zero-compromise test suite covering static analysis, unit tests, integration tests, and full browser E2E flows.

```bash
# 1. Linting and code style (ESLint with strict React Refresh rules)
pnpm lint

# 2. Type checking (Strict TypeScript)
pnpm typecheck

# 3. Unit and integration tests (209 tests across 19 suites in Vitest)
pnpm test

# 4. Production build verification (Vite)
pnpm build

# 5. Full browser End-to-End test suite (28 tests across 3 suites in Playwright)
pnpm test:e2e
```

### E2E Test Coverage:
- `tests/e2e/platform.spec.ts`: Landing page isolation, protected routes, login, signup, verification, recovery, profile editing, logout, OAuth error resilience, and 404 handling.
- `tests/e2e/laboratorySession.spec.ts`: 3D scene and camera preservation across workspace navigation, clean logout teardown, and example loaders.
- `tests/e2e/smoke.spec.ts`: Agent executing all 8 WebMCP tools in tandem with human UI actions, surface progress HUD, and audit trails.

---

## Deployment (Vercel)

BioFold 3D is designed for zero-config static hosting on modern edge platforms like Vercel:

1. Push your code to GitHub.
2. Import the repository into your Vercel Dashboard.
3. Configure the Production Environment Variables:
   - `VITE_SUPABASE_URL`: Your Supabase Project URL (`https://<project-ref>.supabase.co`).
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase publishable key (`sb_publishable_...`).
4. In your Supabase Dashboard (**Authentication → URL Configuration**), add your production URLs to **Redirect URLs**:
   - `https://your-biofold-app.vercel.app/**`
   - `https://your-biofold-app.vercel.app/auth/callback`
5. Deploy. `vercel.json` provides strict Content Security Policies, Permissions Policies for WebMCP, and SPA route rewrites.

---

## Scientific Scope & Limitations

BioFold 3D is an exploratory visual workspace and educational workbench. It is **not** a diagnostic, clinical, or drug-discovery decision system.
- **Mutation Preview:** Compares amino acid physicochemical tables and identifies static geometric neighbors within 5 Å. It does **not** perform molecular dynamics, force-field energy minimization, AlphaFold structure prediction, binding affinity calculations, or clinical pathogenicity classification.
- **PDB Structures:** Coordinates are parsed from RCSB mmCIF / PDB files or static fixtures and displayed as experimentally determined.

---

## License & Scientific Provenance

- **Application Code:** [MIT License](./LICENSE) — © 2026 BioFold Contributors.
- **Molecular Rendering:** [3Dmol.js](https://3dmol.org/) is licensed under the BSD-3-Clause License.
- **Structural Data:** Experimental protein structures (`1CRN`, `4HHB`, etc.) are curated from the [RCSB Protein Data Bank](https://www.rcsb.org/).
