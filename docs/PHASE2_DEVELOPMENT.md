# Phase 2.3 MVP development

Phase 2.3 closes the MVP around private persisted projects and a confirmed-action scientific assistant. Work is developed on `codex/phase2-3-mvp`; no schema, secret, function, seed, or deployment in this branch is applied automatically to the hosted BioFold project.

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

`biofold-chat` verifies the bearer session with Supabase Auth, proves project/conversation ownership through the user-scoped RLS client, and delegates admission/finalization to atomic service-only RPCs. Admission reserves USD 0.05, permits six new requests per rolling 60 seconds, and enforces USD 1 per user per UTC day. Completed request IDs replay without consuming quota; active or failed IDs conflict.

The provider is fixed to `openai/gpt-5-mini` with streaming, strict JSON Schema, required provider parameters and a 1,200-token output ceiling. An incremental JSON tokenizer emits only decoded root `answer` text. The complete response and all eight proposal contracts are validated and persisted before citations, proposals, optional usage and `done` are emitted. Interrupted partial text is never persisted and never exposes proposals.

RCSB and UniProt use independent provider/key cache records: 2xx responses are fresh for seven days and stale-eligible for thirty, while 404 records are negative-cached for one hour. Conditional ETag/Last-Modified requests are used when available. Each lookup records hit, miss, revalidated, stale fallback or unavailable plus status and latency; the browser cannot read cache or telemetry tables.

The browser receives typed SSE and reads conversation data through `AssistantConversationPort` (`list`, `load`, `rename`, `delete`). New conversations remain local drafts until the first admitted message creates the row atomically. The browser never receives the OpenRouter key or service role. Proposals remain inert until the user presses **Apply**, after which they execute through the existing Command Bus and append `Assistant · confirmed` activity.

For local work, copy `supabase/functions/.env.example` to the ignored `supabase/functions/.env.local`, start Supabase, then run `pnpm supabase:functions`. The model name is not configurable. `SUPABASE_URL` and an administrative key are supplied by the local runtime; hosted secrets must be configured in Supabase, never Vercel or a `VITE_*` variable. Modern `SUPABASE_SECRET_KEY` is preferred and the legacy service-role key remains a compatibility fallback.

## Verified local gates

- Clean `supabase db reset` with Docker and CLI 2.116.0.
- 43/43 pgTAP tests and a seven-connection race with exactly six admissions and one rate rejection.
- Local DB lint at warning level with no findings.
- Both Edge Functions boot in the local Edge runtime.
- Real local `gte-small` ingestion produced six 384D chunks; the identical second run skipped both sources.
- 323/323 Vitest tests, 53/53 Playwright tests, strict typecheck and production build.

## Remaining hosted production gates

1. Review the hosted branch with Supabase Security and Performance Advisors.
2. Apply migrations to a non-production Supabase branch and repeat two-user isolation tests.
3. Run the 16-case live Assistant evaluation with disposable OpenRouter credit.
4. Validate SMTP, Google OAuth, exact redirects/origins and a Vercel preview.
5. Apply to BioFold production only after those checks and an explicit owner-approved backup/deployment window.

## Knowledge corpus

`knowledge/manifest.json` schema v2 records normalization, deterministic heading/paragraph chunking, 1,200-character and 180-word limits, `gte-small`/384D normalized embeddings, source checksums and artifact checksums. Local content is authored for BioFold under MIT.

```bash
pnpm knowledge:build   # regenerate manifest hashes, payload and local seed
pnpm knowledge:check   # read-only reproducibility gate
pnpm knowledge:ingest  # authenticated POST to biofold-ingest-knowledge
pnpm eval:assistant    # 16 live golden cases, rate-limit aware
```

Ingestion is POST-only, has no CORS headers and requires `BIOFOLD_INGEST_TOKEN`. An identical source with complete embeddings is skipped; a changed source is replaced transactionally. The live evaluation uses a new conversation and request UUID per case, permits one transient retry, spaces starts by at least 10.5 seconds, and gates citation validity, source recall, abstention, proposal safety, TTFT and completion latency.
