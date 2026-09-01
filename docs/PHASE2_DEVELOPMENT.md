# Phase 2 development

Phase 2 adds private persisted projects and a confirmed-action scientific assistant. The integration branch starts with contracts and safe local scaffolding; no schema or function in this branch is applied automatically to the hosted BioFold project.

## Local Supabase

The repository pins Supabase CLI 2.116.0 as a development dependency. Docker must be running.

```bash
pnpm supabase:start
pnpm supabase:status
pnpm supabase:reset
pnpm supabase:test
pnpm supabase:stop
```

The initial schema migration and RLS tests belong to the external data agent. `.env.local`, `supabase/.temp/` and Supabase secret files remain ignored.

## Shared boundaries

- `ProjectDataPort` is the only persistence interface used by product code.
- `AssistantClient` exposes an async stream of typed events rather than a provider SDK.
- `InMemoryProjectDataPort` and `MockAssistantClient` let UI work proceed without a database or model account.
- `WorkspaceSnapshotV1` stores only confirmed serializable state.
- Assistant proposals are parsed through the existing command catalog and cannot execute without explicit confirmation.

## Assistant backend

The `biofold-chat` Edge Function scaffold validates origin, method, authorization presence and request shape, then returns a deliberate `MODEL_UNAVAILABLE` response. It contains no development bypass and no provider secret.

The production integration will authorize the user in code, load the project through RLS, retrieve curated evidence, and call OpenRouter with a server-only `OPENROUTER_API_KEY`. Never add that key to a `VITE_*` variable or repository file.

## Knowledge corpus

`knowledge/manifest.json` records the embedding contract, source metadata and SHA-256 checksums. Local content is authored for BioFold under MIT. RCSB and UniProt are declared as live metadata providers and are not scraped into the repository.
