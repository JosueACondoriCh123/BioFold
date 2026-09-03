-- BioFold 3D Phase 2.3: additive assistant admission, ingestion and cache controls.
-- Previously published migrations remain untouched.

-- Durable assistant accounting ------------------------------------------------

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_check CHECK (char_length(content) <= 8000);

ALTER TABLE public.ai_requests
  ADD COLUMN IF NOT EXISTS reserved_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0
    CHECK (reserved_cost_usd >= 0),
  ADD COLUMN IF NOT EXISTS budget_date DATE,
  ADD COLUMN IF NOT EXISTS provider_called BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_request_id TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

UPDATE public.ai_requests
SET budget_date = (timezone('UTC', created_at))::date
WHERE budget_date IS NULL;

ALTER TABLE public.ai_requests
  ALTER COLUMN budget_date SET DEFAULT ((timezone('UTC', now()))::date),
  ALTER COLUMN budget_date SET NOT NULL;

ALTER TABLE public.ai_requests
  ALTER COLUMN prompt_tokens DROP NOT NULL,
  ALTER COLUMN completion_tokens DROP NOT NULL,
  ALTER COLUMN total_tokens DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS ai_requests_status_check;

ALTER TABLE public.ai_requests
  ADD CONSTRAINT ai_requests_status_check CHECK (status IN (
    'running', 'completed', 'failed', 'cancelled', 'rate_limited', 'expired', 'budget_exceeded'
  )),
  ADD CONSTRAINT ai_requests_provider_request_id_not_blank
    CHECK (provider_request_id IS NULL OR char_length(trim(provider_request_id)) BETWEEN 1 AND 256);

CREATE INDEX IF NOT EXISTS idx_ai_requests_running_expiration
  ON public.ai_requests (expires_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_ai_requests_user_budget_date
  ON public.ai_requests (user_id, budget_date, status);
CREATE INDEX IF NOT EXISTS idx_ai_requests_user_rate_window
  ON public.ai_requests (user_id, created_at DESC)
  WHERE status IN ('running', 'completed', 'failed', 'cancelled', 'expired');

CREATE OR REPLACE FUNCTION public.touch_conversation_after_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = clock_timestamp()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_conversation_after_message ON public.messages;
CREATE TRIGGER touch_conversation_after_message
  AFTER INSERT ON public.messages FOR EACH ROW
  EXECUTE FUNCTION public.touch_conversation_after_message();

CREATE OR REPLACE FUNCTION public.claim_assistant_request(
  p_project_id UUID,
  p_user_id UUID,
  p_request_id TEXT,
  p_message TEXT,
  p_conversation_id UUID DEFAULT NULL,
  p_model TEXT DEFAULT 'openai/gpt-5-mini',
  p_daily_budget_usd NUMERIC DEFAULT 1.00,
  p_reservation_usd NUMERIC DEFAULT 0.05
)
RETURNS TABLE (
  allowed BOOLEAN,
  status TEXT,
  error_code TEXT,
  ai_request_id UUID,
  conversation_id UUID
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_budget_date DATE := (timezone('UTC', v_now))::date;
  v_existing public.ai_requests%ROWTYPE;
  v_conversation_id UUID := p_conversation_id;
  v_request_count INTEGER;
  v_committed NUMERIC(12, 6);
  v_ai_request_id UUID;
  v_title TEXT;
BEGIN
  IF p_request_id IS NULL OR char_length(trim(p_request_id)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid request identifier' USING ERRCODE = '22023';
  END IF;
  IF p_model IS NULL OR char_length(trim(p_model)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid model identifier' USING ERRCODE = '22023';
  END IF;
  IF p_message IS NULL OR char_length(trim(p_message)) NOT BETWEEN 1 AND 8000 THEN
    RAISE EXCEPTION 'Invalid assistant message' USING ERRCODE = '22023';
  END IF;
  IF p_daily_budget_usd <= 0 OR p_reservation_usd <= 0 OR p_reservation_usd > p_daily_budget_usd THEN
    RAISE EXCEPTION 'Invalid assistant budget configuration' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects WHERE id = p_project_id AND owner_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Project is not owned by the requested user' USING ERRCODE = '42501';
  END IF;
  IF v_conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = v_conversation_id AND project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'Conversation is not part of the requested project' USING ERRCODE = '42501';
  END IF;

  -- Serialize admission per user, including expiration, replay, rate and budget.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  UPDATE public.ai_requests AS request
  SET status = 'expired',
      cost_usd = CASE
        WHEN request.provider_called THEN coalesce(request.cost_usd, request.reserved_cost_usd)
        ELSE coalesce(request.cost_usd, 0)
      END,
      reserved_cost_usd = 0,
      completed_at = v_now,
      error_message = coalesce(request.error_message, 'Reservation expired after five minutes')
  WHERE request.user_id = p_user_id AND request.status = 'running'
    AND coalesce(request.expires_at, request.created_at + interval '5 minutes') <= v_now;

  SELECT request.* INTO v_existing
  FROM public.ai_requests AS request
  WHERE request.user_id = p_user_id AND request.request_id = trim(p_request_id);

  IF FOUND THEN
    IF v_existing.project_id <> p_project_id THEN
      RETURN QUERY SELECT false, 'conflict'::TEXT, 'CONFLICT'::TEXT, v_existing.id, NULL::UUID;
    ELSIF v_existing.status = 'completed' THEN
      RETURN QUERY SELECT true, 'completed'::TEXT, NULL::TEXT, v_existing.id, v_existing.conversation_id;
    ELSE
      RETURN QUERY SELECT false, 'conflict'::TEXT, 'CONFLICT'::TEXT, v_existing.id, v_existing.conversation_id;
    END IF;
    RETURN;
  END IF;

  SELECT count(*) INTO v_request_count
  FROM public.ai_requests AS request
  WHERE request.user_id = p_user_id
    AND request.created_at > v_now - interval '60 seconds'
    AND request.status IN ('running', 'completed', 'failed', 'cancelled', 'expired');

  IF v_request_count >= 6 THEN
    INSERT INTO public.ai_requests (
      project_id, conversation_id, user_id, request_id, model, status,
      reserved_cost_usd, budget_date, completed_at, error_message, created_at
    ) VALUES (
      p_project_id, v_conversation_id, p_user_id, trim(p_request_id), trim(p_model),
      'rate_limited', 0, v_budget_date, v_now, 'Six requests per 60 seconds reached', v_now
    ) RETURNING id INTO v_ai_request_id;
    RETURN QUERY SELECT false, 'rate_limited'::TEXT, 'RATE_LIMITED'::TEXT, v_ai_request_id, v_conversation_id;
    RETURN;
  END IF;

  SELECT coalesce(sum(coalesce(request.cost_usd, 0) + request.reserved_cost_usd), 0)
  INTO v_committed
  FROM public.ai_requests AS request
  WHERE request.user_id = p_user_id AND request.budget_date = v_budget_date
    AND request.status NOT IN ('rate_limited', 'budget_exceeded');

  IF v_committed + p_reservation_usd > p_daily_budget_usd THEN
    INSERT INTO public.ai_requests (
      project_id, conversation_id, user_id, request_id, model, status,
      reserved_cost_usd, budget_date, completed_at, error_message, created_at
    ) VALUES (
      p_project_id, v_conversation_id, p_user_id, trim(p_request_id), trim(p_model),
      'budget_exceeded', 0, v_budget_date, v_now, 'Free daily Assistant limit reached', v_now
    ) RETURNING id INTO v_ai_request_id;
    RETURN QUERY SELECT false, 'budget_exceeded'::TEXT, 'BUDGET_EXCEEDED'::TEXT, v_ai_request_id, v_conversation_id;
    RETURN;
  END IF;

  IF v_conversation_id IS NULL THEN
    v_title := left(trim(regexp_replace(p_message, '\s+', ' ', 'g')), 80);
    IF v_title = '' THEN v_title := 'Assistant conversation'; END IF;
    INSERT INTO public.conversations (project_id, title)
    VALUES (p_project_id, v_title) RETURNING id INTO v_conversation_id;
  END IF;

  INSERT INTO public.ai_requests (
    project_id, conversation_id, user_id, request_id, model, status,
    reserved_cost_usd, budget_date, expires_at, created_at
  ) VALUES (
    p_project_id, v_conversation_id, p_user_id, trim(p_request_id), trim(p_model),
    'running', p_reservation_usd, v_budget_date, v_now + interval '5 minutes', v_now
  ) RETURNING id INTO v_ai_request_id;

  INSERT INTO public.messages (conversation_id, sender, content, request_id)
  VALUES (v_conversation_id, 'user', trim(p_message), trim(p_request_id));

  RETURN QUERY SELECT true, 'running'::TEXT, NULL::TEXT, v_ai_request_id, v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_assistant_request(
  p_request_id TEXT,
  p_user_id UUID,
  p_status TEXT,
  p_provider_called BOOLEAN,
  p_provider_request_id TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_prompt_tokens INTEGER DEFAULT NULL,
  p_completion_tokens INTEGER DEFAULT NULL,
  p_total_tokens INTEGER DEFAULT NULL,
  p_cost_usd NUMERIC DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_assistant_message_id UUID DEFAULT NULL,
  p_content TEXT DEFAULT NULL,
  p_citations JSONB DEFAULT NULL,
  p_proposals JSONB DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  status TEXT,
  final_cost_usd NUMERIC(10, 6),
  assistant_message_id UUID,
  conversation_id UUID
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_request public.ai_requests%ROWTYPE;
  v_provider_called BOOLEAN;
  v_final_cost NUMERIC(10, 6);
BEGIN
  IF p_status NOT IN ('completed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid final assistant status' USING ERRCODE = '22023';
  END IF;
  IF p_cost_usd IS NOT NULL AND p_cost_usd < 0
    OR p_duration_ms IS NOT NULL AND p_duration_ms < 0
    OR p_prompt_tokens IS NOT NULL AND p_prompt_tokens < 0
    OR p_completion_tokens IS NOT NULL AND p_completion_tokens < 0
    OR p_total_tokens IS NOT NULL AND p_total_tokens < 0 THEN
    RAISE EXCEPTION 'Assistant accounting values cannot be negative' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  SELECT request.* INTO v_request
  FROM public.ai_requests AS request
  WHERE request.user_id = p_user_id AND request.request_id = trim(p_request_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assistant request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status <> 'running' THEN
    RAISE EXCEPTION 'Assistant request is not running' USING ERRCODE = '40001';
  END IF;

  v_provider_called := v_request.provider_called OR p_provider_called;
  v_final_cost := CASE
    WHEN p_cost_usd IS NOT NULL THEN p_cost_usd
    WHEN v_provider_called THEN v_request.reserved_cost_usd
    ELSE 0
  END;

  IF p_status = 'completed' THEN
    IF NOT v_provider_called OR p_assistant_message_id IS NULL OR p_content IS NULL
      OR v_request.conversation_id IS NULL THEN
      RAISE EXCEPTION 'Completed requests require provider output and a conversation' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.messages (
      id, conversation_id, sender, content, citations, proposals, request_id
    ) VALUES (
      p_assistant_message_id, v_request.conversation_id, 'assistant', p_content,
      coalesce(p_citations, '[]'::jsonb), coalesce(p_proposals, '[]'::jsonb), trim(p_request_id)
    );
  END IF;

  UPDATE public.ai_requests AS request
  SET status = p_status,
      provider_called = v_provider_called,
      provider_request_id = nullif(trim(p_provider_request_id), ''),
      model = coalesce(nullif(trim(p_model), ''), request.model),
      prompt_tokens = p_prompt_tokens,
      completion_tokens = p_completion_tokens,
      total_tokens = p_total_tokens,
      cost_usd = v_final_cost,
      reserved_cost_usd = 0,
      duration_ms = p_duration_ms,
      completed_at = clock_timestamp(),
      error_message = p_error_message
  WHERE request.id = v_request.id;

  RETURN QUERY SELECT true, p_status, v_final_cost, p_assistant_message_id, v_request.conversation_id;
END;
$$;

-- Server-only RAG retrieval and reproducible ingestion ----------------------

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS corpus_version TEXT,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER;
ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS checksum TEXT,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER;

CREATE TABLE IF NOT EXISTS public.knowledge_ingestion_runs (
  id UUID PRIMARY KEY,
  corpus_version TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimensions INTEGER NOT NULL CHECK (embedding_dimensions = 384),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  source_count INTEGER NOT NULL CHECK (source_count >= 0),
  chunk_count INTEGER NOT NULL CHECK (chunk_count >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);
ALTER TABLE public.knowledge_ingestion_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.hybrid_search_knowledge(
  query_text TEXT,
  query_embedding extensions.vector(384) DEFAULT NULL,
  match_count INTEGER DEFAULT 6,
  full_text_weight DOUBLE PRECISION DEFAULT 1,
  semantic_weight DOUBLE PRECISION DEFAULT 1,
  rrf_k INTEGER DEFAULT 50,
  max_semantic_distance DOUBLE PRECISION DEFAULT 0.35
)
RETURNS TABLE (
  chunk_id UUID, source_id TEXT, title TEXT, content TEXT, locator TEXT,
  publisher TEXT, url TEXT, retrieved_at DATE, score DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH full_text AS (
    SELECT kc.id,
      row_number() OVER (ORDER BY ts_rank_cd(kc.fts, websearch_to_tsquery('english', query_text)) DESC) AS rank
    FROM public.knowledge_chunks AS kc
    WHERE trim(query_text) <> '' AND kc.fts @@ websearch_to_tsquery('english', query_text)
    ORDER BY rank
    LIMIT LEAST(GREATEST(match_count, 1), 10) * 4
  ),
  semantic AS (
    SELECT kc.id, row_number() OVER (ORDER BY kc.embedding OPERATOR(extensions.<=>) query_embedding) AS rank
    FROM public.knowledge_chunks AS kc
    WHERE query_embedding IS NOT NULL AND kc.embedding IS NOT NULL
      AND (kc.embedding OPERATOR(extensions.<=>) query_embedding) <= LEAST(GREATEST(max_semantic_distance, 0), 2)
    ORDER BY rank
    LIMIT LEAST(GREATEST(match_count, 1), 10) * 4
  ),
  candidates AS (SELECT id FROM full_text UNION SELECT id FROM semantic),
  ranked AS (
    SELECT candidates.id,
      coalesce(full_text_weight / (rrf_k + full_text.rank), 0) +
      coalesce(semantic_weight / (rrf_k + semantic.rank), 0) AS score
    FROM candidates LEFT JOIN full_text USING (id) LEFT JOIN semantic USING (id)
  )
  SELECT kc.id, kc.source_id, kc.title, kc.content, kc.locator,
    ks.publisher, ks.url, ks.retrieved_at, ranked.score
  FROM ranked
  JOIN public.knowledge_chunks AS kc ON kc.id = ranked.id
  JOIN public.knowledge_sources AS ks ON ks.id = kc.source_id
  ORDER BY ranked.score DESC, kc.id
  LIMIT LEAST(GREATEST(match_count, 1), 10);
$$;

CREATE OR REPLACE FUNCTION public.replace_knowledge_source(
  p_run_id UUID, p_corpus_version TEXT, p_source JSONB, p_chunks JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_chunk JSONB;
  v_source_id TEXT := trim(p_source->>'id');
  v_count INTEGER := 0;
  v_embedding extensions.vector(384);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_ingestion_runs
    WHERE id = p_run_id AND status = 'running' AND corpus_version = p_corpus_version
  ) THEN
    RAISE EXCEPTION 'Knowledge ingestion run is not active' USING ERRCODE = '22023';
  END IF;
  IF v_source_id = '' OR p_source->>'checksum' !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_chunks) <> 'array' OR jsonb_array_length(p_chunks) = 0 THEN
    RAISE EXCEPTION 'Invalid knowledge source payload' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.knowledge_chunks WHERE source_id = v_source_id;
  INSERT INTO public.knowledge_sources (
    id, title, publisher, url, license, retrieved_at, content_path, sha256,
    corpus_version, embedding_model, embedding_dimensions
  ) VALUES (
    v_source_id, p_source->>'title', p_source->>'publisher', p_source->>'url',
    p_source->>'license', (p_source->>'retrievedAt')::date, p_source->>'contentPath',
    p_source->>'checksum', p_corpus_version, 'gte-small', 384
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title, publisher = EXCLUDED.publisher, url = EXCLUDED.url,
    license = EXCLUDED.license, retrieved_at = EXCLUDED.retrieved_at,
    content_path = EXCLUDED.content_path, sha256 = EXCLUDED.sha256,
    corpus_version = EXCLUDED.corpus_version, embedding_model = EXCLUDED.embedding_model,
    embedding_dimensions = EXCLUDED.embedding_dimensions;

  FOR v_chunk IN SELECT value FROM jsonb_array_elements(p_chunks)
  LOOP
    IF jsonb_typeof(v_chunk->'embedding') <> 'array'
      OR jsonb_array_length(v_chunk->'embedding') <> 384
      OR v_chunk->>'checksum' !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Invalid knowledge chunk payload' USING ERRCODE = '22023';
    END IF;
    v_embedding := (v_chunk->>'embedding')::extensions.vector(384);
    INSERT INTO public.knowledge_chunks (
      source_id, chunk_index, title, content, locator, token_count, embedding,
      checksum, embedding_model, embedding_dimensions
    ) VALUES (
      v_source_id, (v_chunk->>'index')::integer, v_chunk->>'title', v_chunk->>'content',
      v_chunk->>'locator', (v_chunk->>'wordCount')::integer, v_embedding,
      v_chunk->>'checksum', 'gte-small', 384
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Independent provider cache and server-only telemetry ----------------------

CREATE TABLE IF NOT EXISTS public.external_evidence_cache (
  provider TEXT NOT NULL CHECK (provider IN ('rcsb', 'uniprot')),
  cache_key TEXT NOT NULL CHECK (char_length(trim(cache_key)) BETWEEN 1 AND 256),
  status_code INTEGER NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  payload JSONB,
  etag TEXT,
  last_modified TEXT,
  fetched_at TIMESTAMPTZ NOT NULL,
  fresh_until TIMESTAMPTZ NOT NULL,
  stale_until TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (provider, cache_key),
  CHECK (fresh_until <= stale_until),
  CHECK ((status_code = 404 AND payload IS NULL) OR status_code <> 404)
);
CREATE INDEX IF NOT EXISTS idx_external_evidence_cache_expiry
  ON public.external_evidence_cache (provider, fresh_until, stale_until);
ALTER TABLE public.external_evidence_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.external_evidence_metrics (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  request_id TEXT NOT NULL CHECK (char_length(trim(request_id)) BETWEEN 1 AND 128),
  provider TEXT NOT NULL CHECK (provider IN ('rcsb', 'uniprot')),
  cache_key TEXT NOT NULL CHECK (char_length(trim(cache_key)) BETWEEN 1 AND 256),
  outcome TEXT NOT NULL CHECK (outcome IN ('hit', 'miss', 'revalidated', 'stale_fallback', 'unavailable')),
  http_status INTEGER CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_external_evidence_metrics_request
  ON public.external_evidence_metrics (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_evidence_metrics_provider_outcome
  ON public.external_evidence_metrics (provider, outcome, created_at DESC);
ALTER TABLE public.external_evidence_metrics ENABLE ROW LEVEL SECURITY;

-- Least privilege ------------------------------------------------------------

DROP POLICY IF EXISTS "ai_requests_select_own" ON public.ai_requests;
DROP POLICY IF EXISTS "knowledge_sources_select_all" ON public.knowledge_sources;
DROP POLICY IF EXISTS "knowledge_chunks_select_all" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "structure_metadata_select_all" ON public.structure_metadata;
DROP POLICY IF EXISTS "messages_insert_user_only" ON public.messages;

REVOKE ALL ON TABLE public.ai_requests, public.knowledge_sources, public.knowledge_chunks,
  public.knowledge_ingestion_runs, public.external_evidence_cache,
  public.external_evidence_metrics, public.structure_metadata
FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.messages FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_requests,
  public.knowledge_sources, public.knowledge_chunks, public.knowledge_ingestion_runs,
  public.external_evidence_cache, public.external_evidence_metrics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects, public.conversations, public.messages
  TO service_role;
GRANT SELECT ON TABLE public.structure_metadata TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.external_evidence_metrics_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.claim_assistant_request(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, NUMERIC
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_assistant_request(
  TEXT, UUID, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER, INTEGER, NUMERIC,
  INTEGER, TEXT, UUID, TEXT, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hybrid_search_knowledge(
  TEXT, extensions.vector, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_knowledge_source(UUID, TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_assistant_request(
  UUID, UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, NUMERIC
) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_assistant_request(
  TEXT, UUID, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, INTEGER, INTEGER, NUMERIC,
  INTEGER, TEXT, UUID, TEXT, JSONB, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.hybrid_search_knowledge(
  TEXT, extensions.vector, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, DOUBLE PRECISION
) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_knowledge_source(UUID, TEXT, JSONB, JSONB)
  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversations TO authenticated;
GRANT SELECT ON TABLE public.messages TO authenticated;
