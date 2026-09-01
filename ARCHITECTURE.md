# BioFold 3D Architecture

BioFold 3D is a client-first, modular platform designed around strict boundaries between public application screens, session management, and a WebMCP-native 3D molecular laboratory.

Both human researchers and browser AI agents interact with the active 3D scene through a unified, typed command bus that guarantees identical behavior, input validation, scientific evidence tagging, and an immutable audit trail.

---

## 1. System Topology & Data Flow

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          User Browser Session                          │
├────────────────────────────────────────────────────────────────────────┤
│  Public Screens (/)         Auth Pages (/login, /signup, /recover)     │
│  └── Lightweight Preview    └── PKCE Session Resolution & Validation   │
├────────────────────────────────────────────────────────────────────────┤
│                       Workspace Session Boundary                       │
│                        (src/core/workspaceSession.ts)                  │
├────────────────────────────────────────────────────────────────────────┤
│           Authenticated Workspace (/app, /app/account, /app/lab)       │
│                                                                        │
│   Human UI Controls (React) ──────┐                                    │
│                                   ▼                                    │
│   WebMCP Tools (Agent) ───> Command Bus (src/core/commandBus.ts)       │
│                                   │                                    │
│         ┌─────────────────────────┼─────────────────────────┐          │
│         ▼                         ▼                         ▼          │
│    Zustand Store             ViewerPort             Geometry Client    │
│  (UI & Activity Log)     (3Dmol.js / WebGL)        (Dedicated Worker)  │
│                                   │                         │          │
│                                   ▼                         ▼          │
│                            Live 3D Canvas          Surfaces / Metrics  │
│                                   │                                    │
│                                   ▼                                    │
│                           Structure Gateway                            │
│                        (Bundled / RCSB mmCIF)                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Architectural Layers

### Layer 1: Platform UI & Routing (`src/pages/`, `src/components/platform/`, `src/integration/`)
- **Declarative Route Tree:** Managed by React Router with code-splitting (`React.lazy`) for each platform screen.
- **Fail-Closed Boundary (`PlatformEntry.tsx`):** Coordinates module discovery, ensures styling and providers are initialized before rendering screens, and prevents partial-state execution.
- **Public vs. Protected Separation:**
  - Public routes (`/`, `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/auth/callback`) load rapidly without booting WebGL or background geometry threads.
  - Protected routes (`/app`, `/app/lab`, `/app/account`) verify active session presence, redirecting unauthenticated visitors to `/login?next=<destination>`.
- **Reusable Platform Components:** Accessible design system with form actions (`useFormAction.ts`), semantic inputs with show/hide password toggles (`AuthForm.tsx`), and responsive layout containers (`PlatformLayout.tsx`).

### Layer 2: Authentication & Session Boundary (`src/auth/`, `src/core/workspaceSession.ts`)
- **Domain Auth Contract (`AuthPort`):** The application relies on an abstract port defining authentication actions (`signInWithPassword`, `signUpWithPassword`, `signInWithGoogle`, `signOut`, `requestPasswordRecovery`, `updatePassword`, `updateDisplayName`, `resendConfirmationEmail`).
- **Supabase Adapter (`supabaseAuthAdapter.ts`):** Implements `AuthPort` using `@supabase/supabase-js` configured with PKCE flow (`flowType: 'pkce'`), automatic token refresh, and URL hash cleaning.
- **Fail-Closed Configuration (`supabaseClient.ts`):** Validates publishable keys against strict public URL patterns (`isPublicSupabaseConfig`). If configuration is absent or malformed, the platform enters an explicit unconfigured status rather than falling back to mock production accounts.
- **Zero Schema Overhead:** User metadata (`user_metadata.full_name`) stores profile details directly inside Supabase Auth, requiring zero custom PostgreSQL tables or migrations.
- **Workspace Session Controller (`workspaceSession.ts`):** Gates access to the 3D laboratory. When a user logs out, the workspace session is immediately cleared, preventing memory leaks or data bleeding between distinct accounts.

### Layer 3: Domain Core & Command Bus (`src/core/`)
- **Command Bus (`commandBus.ts`):** Central entry point for all molecular operations. Human clicks and agent tool executions dispatch commands through `commandBus.execute(command, payload, { origin })`.
- **Validation & Provenance:** Every command validates its payload schema (`commandContracts.ts`), checks viewer readiness, and writes an entry to the activity log containing:
  - `id`: Unique activity identifier.
  - `command`: Target command name (`load_structure`, `show_surface`, `measure_distance`, etc.).
  - `origin`: `"human"` or `"agent"`.
  - `status`: `"success"` or `"error"`.
  - `evidence`: Scientific confidence level (`"observed"`, `"calculated"`, `"heuristic"`, `"unavailable"`).
  - `durationMs`: High-resolution execution time.
- **Domain Geometry & Mutations (`geometry.ts`, `mutations.ts`):** Mathematical logic for sub-ångström Euclidean distances, 5 Å spherical neighbor filtering, and coarse physicochemical amino acid comparisons.

### Layer 4: Adapters & Laboratory Runtime (`src/adapters/`, `src/Laboratory.tsx`, `src/workers/`)
- **Viewer Port (`viewerPort.ts`, `viewerLifetime.ts`):** Encapsulates the `3Dmol.js` WebGL instance outside React component state to prevent unnecessary DOM re-renders during high-frequency camera rotations.
- **Background Geometry Worker (`geometryClient.ts`, `geometry.worker.ts`):** Offloads heavy CPU computations (solvent-accessible surface triangulation, pairwise distance matrices) to dedicated Web Workers to ensure a locked 60 FPS main thread.
- **Structure Gateway (`structureGateway.ts`):** Implements deterministic caching for bundled fixtures (`1CRN`, `4HHB`) and fetches live mmCIF models from RCSB with a 10 MiB limit and 12-second timeout.
- **WebMCP Tool Registration (`webmcp.ts`):** Feature-detects `document.modelContext.registerTool`. When inside `/app/lab` with an active session, registers the 8 imperative site tools with detailed JSON schemas. When leaving the lab or logging out, cleanly aborts active requests and unregisters the tools.

---

## 3. Core Invariants & Security Principles

1. **Strict Public Isolation:** The landing page (`/`) and marketing routes never instantiate WebGL contexts, Web Workers, or WebMCP tools.
2. **Single Source of Truth:** AI agents cannot execute hidden or privileged APIs. Every tool maps 1-to-1 to a user-facing command.
3. **Session Preservation Across Navigation:** Navigating from `/app/lab` to `/app/account` suspends rendering and disables tools, but preserves the loaded structure and camera position in memory. Navigating back to `/app/lab` resumes instantly without re-fetching from RCSB.
4. **Clean Session Teardown on Logout:** Explicit logout purges the WebGL canvas, destroys worker threads, clears activity history, and revokes tokens in `localStorage`.
5. **Honest Scientific Labeling:** Mutation previews never claim to predict protein stability, delta-delta-G ($\Delta\Delta G$), binding affinities, or clinical pathogenicity.
