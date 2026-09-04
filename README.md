# BioFold 3D

**A WebMCP-native molecular workspace platform where researchers and AI agents explore the same live protein structures.**

BioFold 3D bridges the gap between molecular visualization, persistent scientific workspaces, and autonomous agentic workflows. Built as a comprehensive web application with secure authentication, optimistic project persistence, responsive navigation, and an interactive 3D laboratory, BioFold enables researchers and browser agents to rotate, style, select, measure, and analyze proteins cooperatively in real time. Every action performed by either a human or an agent flows through a unified command bus and is recorded with scientific provenance in a live activity stream.

---

## Architecture Overview

```mermaid
flowchart TD
    UI -->|Dispatch| CB
    WebMCP -->|Propose/Execute| CB
    AsstUI -->|Confirm Proposal (Apply)| CB
    CB -->|Render| Viewer
    CB -->|Offload calculation| Worker
    CB -->|Persist Snapshot & Events| PDP
    PDP -->|Row-Level Security| SupaDB
    AsstUI -->|Stream prompts| AsstClient
    Viewer -.->|Fetch mmCIF| RCSB
```

---

## Key Features

### 1. Persistent Private Workspaces & Project Management
- **Full Project CRUD:** Create, rename, inspect, and delete private molecular projects with real-time client validation and confirmation dialogues.
- **Optimistic Revision Locking:** Robust concurrency control using versioned revisions (`revision` / `expectedRevision`) that detect conflicting edits and notify the user with resolution workflows.
- **Real-Time Persistence Status:** Live indicators showing `Saving`, `Saved` (with revision number and timestamp), `Offline`, `Conflict`, and `Error` states.
- **Durable Scene Snapshots:** 3D camera angles, color representations, molecular surface opacity, active selections, and atomic measurements are stored in JSON snapshots (`WorkspaceSnapshotV1`) and cleanly restored on reload.
- **Strict Row-Level Security (RLS):** Database policies enforce strict per-user data isolation (`owner_id = auth.uid()`). Direct browser writes to AI-generated messages and token consumption tables are completely blocked from client roles.

### 2. Scientific Assistant & Workspace Inspector
- **Dual-Mode Inspector Panel:**
  - **Results Tab:** Quantitative composition breakdown (chains, residues, atoms, waters), live sub-ångström distance readouts with Euclidean vectors, mutation context with 5.0 Å spatial neighbors & physicochemical shifts (charge, volume, hydropathy), and an audited chronological activity stream.
  - **Assistant Tab:** Interactive AI chat powered by streaming token deltas, Markdown rendering, and contextual prompts.
- **Explicit Command Proposals:** When proposing changes to the 3D scene (e.g. focusing residues, adjusting representations, computing surfaces), the Assistant generates structured `CommandProposal` cards with scientific rationales. Actions require explicit human confirmation (**`Apply`** vs. **`Dismiss`**) with `approvedByUser: true` before execution.
- **Validated provider streaming:** OpenRouter runs the fixed `openai/gpt-5-mini` model with strict structured output. Only the decoded answer streams immediately; citations and the eight audited proposal types are published after complete validation and persistence.
- **Scientific Citations & Provenance:** Built-in citations drawer with verified HTTPS links and publisher badges (`BioFold`, `RCSB PDB`, `UniProt`).
- **Generation Controls:** Live `Stop generating` cancellation via `AbortController` and one-click `Retry` on network interruptions.
- **Multiple Conversations:** Up to 50 private conversations per project, with local drafts, switching, rename, confirmed deletion, and the latest 100 messages restored chronologically.
- **Atomic Free Tier:** Six new requests per 60 seconds and USD 1 per user/UTC day, with server-side reservation and reconciliation. There are no project quotas, payments, or upgrade prompts.

### 3. Interactive 3D Molecular Laboratory
- **High-Performance 3Dmol.js Viewer:** Hardware-accelerated WebGL molecular graphics with cartoon, stick, sphere, and line representations.
- **Scientific Color Schemes:** Chain-based, residue spectrum, and element-based coloring.
- **Molecular Surfaces & Geometry:** Van der Waals molecular surface computation with real-time opacity controls and non-blocking worker threads.
- **Atomic Distance & Neighborhoods:** Sub-ångström distance measurements with 3D dashed vectors and 5 Å spatial neighbor mapping.
- **Deterministic Offline Fixtures & RCSB PDB Ingestion:** Bundled offline structures (`1CRN`, `4HHB`) and on-demand live fetching of valid 4-character mmCIF records from RCSB.

### 4. Molecular Explorer & Catalog Navigation
- **Curated Dataset Catalog:** Browse curated molecular structures across various categories, experimental methods (X-ray, Cryo-EM), organisms, and resolution ranges.
- **Search & Filtering:** Search structures by PDB ID, name, or metadata, and filter by structure properties.
- **1-Click Laboratory Loader:** Direct structure loading from the catalog into the active 3D laboratory session.

### 5. Mutation Workbench & Physicochemical Delta Analysis
- **Residue Substitution Simulation:** Select specific protein residues and propose single-point amino acid substitutions.
- **Physicochemical Delta Calculations:** Compute shifts in charge, hydropathy, and molecular volume.
- **5.0 Å Spatial Neighbor Mapping:** Identify surrounding residues within 5.0 Å Euclidean distance to assess spatial contact environments and potential steric disruptions.

### 6. Vision Studio & High-Definition Rendering Studio (`/app/vision`)
- **Visual Rendering Presets:** High-definition visualization presets including Publication Cartoon, Surface Density, Backbone Highlight, and Schematic Overlay.
- **Custom Lighting & Shading:** Lighting angle controls, background modes (Dark / Light / Transparent), and visual quality tuning.
- **Export & Studio Configuration:** Export publication-ready images and save custom rendering preset configurations for presentation and publication.

### 7. Audited Event History & Provenance Stream
- **Comprehensive Audit Trail:** Real-time event log tracking all workspace actions, user interactions, command dispatches, and agent tool executions.
- **Evidence Tagging:** Every operation and result is classified into explicit scientific evidence levels (*Observed*, *Calculated*, *Heuristic*, *Unavailable*).

### 8. Agentic WebMCP Integration
- **Eight Imperative WebMCP Tools:** Dynamically registered via `document.modelContext.registerTool` strictly when an authenticated user opens `/app/lab`.
- **Single Command Bus:** Human UI controls and agent tools call the exact same typed domain commands—no DOM scraping or backdoor state mutation.
- **Explicit Scientific Evidence Labels:** Every output is tagged as *Observed* (PDB coordinates), *Calculated* (geometric measurements), *Heuristic* (physicochemical mutation comparisons), or *Unavailable*.
- **Lifecycle & Cancellation:** WebMCP tools automatically de-register when leaving the lab, clean up worker jobs on abort signals, and gracefully fall back to human-only mode in standard browsers.

### 9. Responsive Design & Accessibility
- **Breakpoints:** Pixel-perfect layouts adapted for **1440px** (Desktop), **1000px** (Laptop / Tablet landscape), **720px** (Tablet portrait), and **390px** (Mobile).
- **Accessibility:** Full keyboard navigation (`Tab`, arrow navigation for tabs, `Escape` to dismiss modals, `Enter` to send prompts), visible focus rings (`:focus-visible`), ARIA landmarks (`role="tablist"`, `role="tabpanel"`, `role="dialog"`, `role="alert"`), and `aria-live="polite"` status announcements.

---

## Step-by-Step Installation & Setup

### Prerequisites
- **Node.js:** v22.12.0 or higher
- **Package Manager:** `pnpm` 11.19.0 (see `packageManager` in `package.json`)
- **Browser:** Google Chrome (v130+ with WebMCP enabled for AI agent interaction)

### 1. Clone the Repository
```bash
git clone https://github.com/JosueACondoriCh123/BioFold.git
cd BioFold
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment Variables
BioFold connects to Supabase on the client side using public credentials.

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
> Use real public project values for normal development. Without them, accounts remain explicitly unavailable; there is no guest or mock login. Automated QA builds its own isolated configuration and never reads `.env` or `.env.local`. Never put secret keys (`service_role`, database passwords) in `VITE_*` variables. See [Auth setup](docs/AUTH_SETUP.md) for callbacks, Google OAuth, and SMTP configuration.

### 4. Start the Local Development Server
```bash
pnpm dev
```

The application will start at **`http://127.0.0.1:4173`**.

Open your browser to `http://127.0.0.1:4173`:
- Visit the public landing at `/`.
- Sign in at `/login` or create an account at `/signup`.
- Explore your dashboard at `/app`, enter the 3D viewer directly at `/app/lab`, or open Vision Studio at `/app/vision`.

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
| `/app` | Authenticated | User dashboard with saved projects, persistence status, quick guides, and 1-click structure loaders. |
| `/app/lab` | Authenticated | Live 3D molecular laboratory with 3Dmol viewer, scene controls, Inspector tabs (Results & Assistant), Molecular Explorer, Mutation Workbench, Audit History, and WebMCP agent tools. |
| `/app/vision` | Authenticated | Vision Studio for high-definition molecular rendering presets, visual styles, schematic overlays, and studio image exports. |
| `/app/account` | Authenticated | Profile details (name update in Supabase `user_metadata`), security notes, active sessions, and sign out. |
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
# 1. Linting and code style (ESLint with strict rules)
pnpm lint

# 2. Type checking (Strict TypeScript)
pnpm typecheck

# 3. Unit, data, and component test suite (Vitest)
pnpm test

# 4. Production build verification (Vite)
pnpm build

# 5. Full browser End-to-End test suite (Playwright)
pnpm test:e2e

# 6. Reproducible corpus and clean local PostgreSQL gate
pnpm knowledge:check
pnpm supabase:reset
pnpm supabase:test
```

### Test Coverage Highlights:
- **`tests/data/`**: Tests for `SupabaseProjectDataAdapter`, optimistic concurrency locking (`CONFLICT`), input validation, and PostgreSQL Row-Level Security (RLS) simulation for User A, User B, and anonymous access.
- **`tests/features/`**: Tests for `ProjectsDashboard`, `PersistenceIndicator` (`Saving`, `Saved`, `Offline`, `Conflict`, `Error`), `ProjectDialog`, `InspectorPanel`, `ResultsTab`, `AssistantChat` (streaming, cancellation, citations, and command proposals), `MolecularExplorer`, `MutationWorkbench`, `AuditHistoryView`, and `VisionStudio`.
- **`tests/auth/`**: Complete Supabase authentication adapter tests, PKCE flows, session recovery, password update, and navigation redirects.
- **`evals/assistant/`**: Sixteen versioned live RAG cases covering evidence levels, 1CRN/4HHB sources, and mandatory abstention for out-of-scope scientific requests.
- **`tests/e2e/`**: Playwright browser tests verifying landing isolation (no WebGL on home), protected routes, complete auth lifecycle, private project CRUD boundary, scene preservation, Vision Studio rendering, and agent WebMCP interactions.

---

## Database Migrations & Vector Corpus

The persistent layer is backed by Supabase PostgreSQL migrations located in [`supabase/migrations/`](./supabase/migrations/):

1. **`20260901000000_enable_extensions_and_helpers.sql`**: Enables `pgvector` extension and timestamp trigger functions.
2. **`20260901000001_create_profiles_and_projects.sql`**: User profiles and private projects with cascaded foreign keys and owner-isolated RLS.
3. **`20260901000002_create_project_events.sql`**: Activity audit trails with domain status and scientific evidence classifications.
4. **`20260901000003_create_conversations_and_messages.sql`**: AI conversations and message history; Phase 2.3 later makes every message write server-only.
5. **`20260901000004_create_ai_requests_and_structure_metadata.sql`**: Initial token consumption and legacy structure metadata tables.
6. **`20260901000005_create_knowledge_corpus.sql`**: Domain knowledge sources and 384-dimensional chunk embeddings (`vector(384)`) indexed with HNSW cosine distance (`vector_cosine_ops`).
7. **`20260901225652_phase2_assistant_rag.sql`**: Idempotent Assistant messages, full-text search, reciprocal-rank hybrid retrieval and server-only execution privileges.
8. **`20260902233000_phase2_3_db_controls.sql`**: Atomic rate/budget RPCs, conversation recency, server-only corpus ingestion, provider-keyed RCSB/UniProt cache, telemetry and least-privilege grants.

`knowledge/manifest.json` is the schema-v2 corpus authority. `pnpm knowledge:build` deterministically regenerates its payload and seed, while `pnpm knowledge:ingest` calls the POST-only administrative function protected by `BIOFOLD_INGEST_TOKEN`.

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

Assistant secrets belong in Supabase Edge Functions, not Vercel: `OPENROUTER_API_KEY`, `OPENROUTER_SITE_URL`, `BIOFOLD_ALLOWED_ORIGINS`, `BIOFOLD_INGEST_TOKEN`, `BIOFOLD_USER_DAILY_BUDGET_USD=1.00`, and `BIOFOLD_REQUEST_RESERVE_USD=0.05`. The provider model is fixed in code to `openai/gpt-5-mini`.

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
