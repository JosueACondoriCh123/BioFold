# Phase 2 coordination

This document is the handoff boundary for the two external implementation agents. The integrator supplies the exact base commit SHA after the Phase 0 quality gate.

## Branches and ownership

| Owner | Branch | Owned paths |
| --- | --- | --- |
| Data agent | `feature/phase2-data` | `supabase/migrations/`, `src/data/`, data and RLS tests |
| UI agent | `feature/phase2-ui` | `src/features/projects/`, `src/features/assistant/ui/`, feature UI tests |
| Integrator | `codex/phase2-integration` | Shared contracts, `App.tsx`, `Laboratory.tsx`, viewer, assistant transport, Edge Functions and knowledge corpus |

Both external branches must start from the integrator-provided Phase 0 SHA and open pull requests against `codex/phase2-integration`, never `main`.

## Frozen contracts

- `src/types/projects.ts`: `WorkspaceSnapshotV1`, persistence records and `ProjectDataPort`.
- `src/types/assistant.ts`: request, citations, validated command proposals, SSE events and `AssistantClient`.
- The eight commands in `src/core/commandContracts.ts` remain the only scientific actions.
- Assistant proposals use those command contracts and require `approvedByUser: true` before dispatch.

External agents must report any required contract change instead of editing these files independently.

## Security boundary

- Never commit `.env.local` or any service, database, OAuth or OpenRouter secret.
- Never apply migrations or deploy functions to the real BioFold project.
- UI components consume ports only; they do not import Supabase.
- Every table in an exposed schema requires RLS plus explicit ownership policies.
- The Edge Function scaffold is intentionally unavailable until authenticated persistence and the real provider adapter are integrated.

## Pull request evidence

Each handoff includes commit hashes, commands and results, known limitations, contract questions, and either RLS evidence or responsive screenshots as appropriate.
