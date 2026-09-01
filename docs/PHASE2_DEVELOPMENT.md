# Phase 2 development

Phase 2 adds private persisted projects and a confirmed-action scientific assistant. The data and UI branches have been integrated and corrected on `codex/phase2-integration`; no schema or function in this branch is applied automatically to the hosted BioFold project.

## Local Supabase

The repository pins Supabase CLI 2.116.0 as a development dependency. Docker must be running.

```bash
pnpm supabase:start
pnpm supabase:status
pnpm supabase:reset
pnpm supabase:test
pnpm supabase:stop
```

The ordered migrations create projects, activity, conversations, usage records and the future vector corpus. The final hardening migration makes profiles private, removes browser deletion of append-only records, aligns project events with the eight command contracts, supplies explicit Data API grants, optimizes tenant RLS checks and covers foreign-key indexes. `.env.local`, `supabase/.temp/` and Supabase secret files remain ignored.

`pnpm supabase:reset` and `pnpm supabase:test` are the runtime database gate. They require Docker Desktop's Linux engine; static migration-security tests do not replace that gate.

## Shared boundaries

- `ProjectDataPort` is the only persistence interface used by product code.
- `AssistantClient` exposes an async stream of typed events rather than a provider SDK.
- `InMemoryProjectDataPort` and `MockAssistantClient` let UI work proceed without a database or model account.
- `WorkspaceSnapshotV1` stores only confirmed serializable state.
- Assistant proposals are parsed through the existing command catalog and cannot execute without explicit confirmation.
- `SupabaseProjectDataAdapter` rejects invalid stored snapshots instead of silently replacing them.
- The laboratory serializes optimistic snapshot writes, persists one event per completed command, and restores structure, representation, surface, overlays, camera and activity after reload.

## Integrated browser slice

The isolated platform E2E uses the production Supabase SDK and adapters while simulating only Auth and PostgREST at the HTTP boundary. It creates a `4HHB` project, changes representation, records a distance, waits for persistence, reloads the URL and confirms that the scene and audit trail return. The harness never reads `.env.local` or contacts the hosted BioFold project.

## Assistant backend

The `biofold-chat` Edge Function scaffold validates origin, method, authorization presence and request shape, then returns a deliberate `MODEL_UNAVAILABLE` response. It contains no development bypass and no provider secret.

The production integration will authorize the user in code, load the project through RLS, retrieve curated evidence, and call OpenRouter with a server-only `OPENROUTER_API_KEY`. Never add that key to a `VITE_*` variable or repository file. The current inspector uses a deterministic local client so its streaming, cancellation, citations and confirmed-command UX can be tested without presenting generated content as live AI.

## Remaining production gates

1. Start Docker and run the migrations/RLS tests against a clean local Supabase database.
2. Review the resulting schema with Supabase Security and Performance Advisors.
3. Apply migrations to a non-production Supabase branch and repeat two-user isolation tests.
4. Implement authenticated RAG and OpenRouter only inside `biofold-chat`, then replace the deterministic client.
5. Apply to BioFold real only after those checks and an explicit owner-approved backup/deployment window.

## Knowledge corpus

`knowledge/manifest.json` records the embedding contract, source metadata and SHA-256 checksums. Local content is authored for BioFold under MIT. RCSB and UniProt are declared as live metadata providers and are not scraped into the repository.
