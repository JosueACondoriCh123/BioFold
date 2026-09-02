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

The ordered migrations create projects, activity, conversations, usage records and the vector corpus. Phase 2.2 adds idempotent message request IDs, full-text indexing and a service-role-only hybrid retrieval function. The hardening migration makes profiles private, removes browser deletion of append-only records, aligns project events with the eight command contracts, supplies explicit Data API grants, optimizes tenant RLS checks and covers foreign-key indexes. `.env.local`, `supabase/.temp/` and Supabase secret files remain ignored.

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

`biofold-chat` now verifies the bearer session with Supabase Auth, proves project/conversation ownership through the user-scoped RLS client, claims an idempotent request, enforces a six-request-per-minute limit, retrieves curated evidence with reciprocal-rank hybrid search, enriches a loaded PDB through official RCSB/UniProt endpoints with a seven-day cache, validates OpenRouter structured output against the same eight command inputs and persists messages plus usage. External lookup failures degrade to the local corpus. Citations are built from retrieved records; the model cannot supply arbitrary citation URLs.

The browser receives typed SSE and only reads conversation history through `AssistantHistoryPort`. It never receives the OpenRouter key or service role. Proposals remain inert until the user presses **Apply**, after which they execute through the existing Command Bus and append `Assistant · confirmed` activity.

For local work, copy `supabase/functions/.env.example` to the ignored `supabase/functions/.env.local`, start Supabase, then run `pnpm supabase:functions`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied automatically by the local runtime; hosted secrets must be configured in Supabase, never Vercel or a `VITE_*` variable.

## Remaining production gates

1. Start Docker and run the migrations/RLS tests against a clean local Supabase database.
2. Review the resulting schema with Supabase Security and Performance Advisors.
3. Apply migrations to a non-production Supabase branch and repeat two-user isolation tests.
4. Run the Assistant vertical slice with a disposable OpenRouter limit and verify request replay, cancellation, rate limiting and citations.
5. Apply to BioFold real only after those checks and an explicit owner-approved backup/deployment window.

## Knowledge corpus

`knowledge/manifest.json` records the embedding contract, source metadata and SHA-256 checksums. Local content is authored for BioFold under MIT. RCSB and UniProt are live metadata providers: their results are fetched on demand by the Edge Function and cached in `structure_metadata`; they are not scraped into the repository.
