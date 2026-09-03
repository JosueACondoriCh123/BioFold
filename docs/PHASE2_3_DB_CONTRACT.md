# Phase 2.3 database integration contract

This file is the handoff boundary between the additive database migration and the Edge Functions. The migration must not alter any previously published migration.

## `claim_assistant_request`

The service-only RPC receives named arguments:

- `p_project_id uuid`
- `p_user_id uuid`
- `p_request_id text`
- `p_message text`
- `p_conversation_id uuid` (nullable)
- `p_model text`
- `p_daily_budget_usd numeric`
- `p_reservation_usd numeric`

It returns one row containing `allowed boolean`, `status text`, `error_code text`, `ai_request_id uuid`, and `conversation_id uuid`. A completed replay returns `status = 'completed'` without consuming rate or budget. New admission returns `allowed = true, status = 'running'`. Rate and budget rejection return `RATE_LIMITED` and `BUDGET_EXCEEDED`; all other reused non-completed IDs conflict. Once admitted, a missing conversation and the user message are persisted inside the same transaction; rejected requests never create an empty conversation.

## `finalize_assistant_request`

The service-only RPC receives named arguments:

- identity/state: `p_request_id`, `p_user_id`, `p_status`, `p_provider_called`, `p_provider_request_id`, `p_model`
- accounting: nullable `p_prompt_tokens`, `p_completion_tokens`, `p_total_tokens`, `p_cost_usd`, plus `p_duration_ms`
- result: nullable `p_assistant_message_id`, `p_content`, JSON `p_citations`, JSON `p_proposals`, and nullable `p_error_message`

For `completed`, it inserts the assistant message and settles the request in the same transaction. If the provider was not called, failure/cancellation releases the reservation. If it was called and usage is absent, finalization charges the full reservation. Browser roles receive no execute privilege.

## Retrieval and ingestion

`hybrid_search_knowledge` accepts `max_semantic_distance = 0.35`; semantic candidates beyond it are discarded while full-text candidates remain eligible.

`replace_knowledge_source(p_run_id, p_corpus_version, p_source, p_chunks)` replaces exactly one source and all of its chunks transactionally. The administrative ingestion function also writes completed run metadata to `knowledge_ingestion_runs`.

The provider cache uses `external_evidence_cache` keyed by `(provider, cache_key)` and `external_evidence_metrics` with `request_id`, `provider`, `cache_key`, `outcome`, `http_status`, and `latency_ms`. Neither table is readable from browser roles. `structure_metadata` remains legacy read compatibility only and receives no new writes.
