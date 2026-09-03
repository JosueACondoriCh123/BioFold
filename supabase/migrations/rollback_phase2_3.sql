-- BioFold 3D: Idempotent Rollback Script for Phase 2.3 DB Controls
-- Reverts Phase 2.3 additions while preserving prior Phase 2.2 schema integrity.

BEGIN;

-- 1. Drop trigger and trigger function
DROP TRIGGER IF EXISTS touch_conversation_after_message ON public.messages;
DROP FUNCTION IF EXISTS public.touch_conversation_after_message();

-- 2. Drop RPC functions introduced in Phase 2.3
DROP FUNCTION IF EXISTS public.claim_assistant_request(UUID, UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS public.finalize_assistant_request(
  TEXT, UUID, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER, INTEGER, NUMERIC,
  INTEGER, TEXT, UUID, TEXT, JSONB, JSONB
);
DROP FUNCTION IF EXISTS public.replace_knowledge_source(UUID, TEXT, JSONB, JSONB);

-- 3. Drop telemetry and caching tables
DROP TABLE IF EXISTS public.external_evidence_metrics CASCADE;
DROP TABLE IF EXISTS public.external_evidence_cache CASCADE;
DROP TABLE IF EXISTS public.knowledge_ingestion_runs CASCADE;

-- 4. Revert columns on knowledge_chunks and knowledge_sources
ALTER TABLE public.knowledge_chunks
  DROP COLUMN IF EXISTS checksum,
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedding_dimensions;

ALTER TABLE public.knowledge_sources
  DROP COLUMN IF EXISTS corpus_version,
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedding_dimensions;

-- 5. Revert columns and constraints on ai_requests
DROP INDEX IF EXISTS idx_ai_requests_running_expiration;
DROP INDEX IF EXISTS idx_ai_requests_user_budget_date;
DROP INDEX IF EXISTS idx_ai_requests_user_rate_window;

ALTER TABLE public.ai_requests
  DROP CONSTRAINT IF EXISTS ai_requests_provider_request_id_not_blank,
  DROP CONSTRAINT IF EXISTS ai_requests_status_check;

ALTER TABLE public.ai_requests
  ADD CONSTRAINT ai_requests_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'rate_limited'));

ALTER TABLE public.ai_requests
  DROP COLUMN IF EXISTS reserved_cost_usd,
  DROP COLUMN IF EXISTS budget_date,
  DROP COLUMN IF EXISTS provider_called,
  DROP COLUMN IF EXISTS provider_request_id,
  DROP COLUMN IF EXISTS expires_at,
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS error_message;

-- 6. Revert message length check to 4000
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_check CHECK (char_length(content) <= 4000);

-- 7. Restore baseline permissions
GRANT SELECT, INSERT ON TABLE public.messages TO authenticated;
GRANT SELECT ON TABLE public.ai_requests TO authenticated;

COMMIT;
