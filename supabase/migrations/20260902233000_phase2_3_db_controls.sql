-- 20260902233000_phase2_3_db_controls.sql
-- BioFold 3D Phase 2.3: Database Controls, Rate Limiting, Budget Quotas,
-- Recency Triggers, Structure Cache Telemetry, and Reproducible Ingestion RPC.

-- ============================================================================
-- 1. EXPAND MESSAGE CONTENT LENGTH TO 8,000 CHARACTERS
-- ============================================================================

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_content_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_check
    CHECK (char_length(content) <= 8000);

-- ============================================================================
-- 2. EXTEND AI_REQUESTS: RESERVATIONS, EXPIRATION, BUDGET & STATUS
-- ============================================================================

ALTER TABLE public.ai_requests
  ADD COLUMN IF NOT EXISTS reserved_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000 CHECK (reserved_cost_usd >= 0),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE public.ai_requests
  DROP CONSTRAINT IF EXISTS ai_requests_status_check;

ALTER TABLE public.ai_requests
  ADD CONSTRAINT ai_requests_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'rate_limited', 'expired', 'budget_exceeded'));

CREATE INDEX IF NOT EXISTS idx_ai_requests_running_expires
  ON public.ai_requests (status, expires_at)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_ai_requests_user_window
  ON public.ai_requests (user_id, created_at DESC);

-- ============================================================================
-- 3. RECENCY TRIGGERS (CONVERSATIONS & PROJECTS UPDATED_AT)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_message_recency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Touch parent conversation recency
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;

  -- Touch parent project recency
  UPDATE public.projects
  SET updated_at = now()
  WHERE id = (
    SELECT project_id FROM public.conversations WHERE id = NEW.conversation_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_recency ON public.messages;
CREATE TRIGGER trg_messages_recency
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_message_recency();

CREATE OR REPLACE FUNCTION public.handle_project_event_recency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Touch parent project recency
  UPDATE public.projects
  SET updated_at = now()
  WHERE id = NEW.project_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_events_recency ON public.project_events;
CREATE TRIGGER trg_project_events_recency
  AFTER INSERT ON public.project_events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_project_event_recency();

-- ============================================================================
-- 4. ATOMIC RPC: CLAIM_ASSISTANT_REQUEST (6/60s, USD 1/DAY, USD 0.05 RESERVATION, EXPIRATION)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_assistant_request(
  p_project_id UUID,
  p_user_id UUID,
  p_request_id TEXT,
  p_conversation_id UUID DEFAULT NULL,
  p_model TEXT DEFAULT 'unconfigured',
  p_reservation_usd NUMERIC(10, 6) DEFAULT 0.050000,
  p_timeout_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  allowed BOOLEAN,
  status TEXT,
  error_code TEXT,
  error_message TEXT,
  reserved_cost_usd NUMERIC(10, 6),
  ai_request_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_auth_user UUID;
  v_caller_role TEXT;
  v_existing RECORD;
  v_rate_count INTEGER;
  v_daily_spend NUMERIC(10, 6);
  v_daily_limit CONSTANT NUMERIC(10, 6) := 1.000000;
  v_new_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Verify authorization: must be called by the user or service_role
  v_auth_user := (SELECT auth.uid());
  v_caller_role := coalesce((SELECT auth.role()), current_user);
  IF v_auth_user IS NOT NULL AND v_auth_user <> p_user_id AND v_caller_role <> 'service_role' THEN
    RETURN QUERY SELECT false, 'forbidden'::TEXT, 'AUTH_FORBIDDEN'::TEXT, 'Cannot claim request for another user'::TEXT, 0.000000::NUMERIC(10, 6), NULL::UUID;
    RETURN;
  END IF;

  -- Validate request identifier length
  IF p_request_id IS NULL OR char_length(trim(p_request_id)) NOT BETWEEN 1 AND 128 THEN
    RETURN QUERY SELECT false, 'invalid_input'::TEXT, 'INVALID_REQUEST_ID'::TEXT, 'Request ID must be between 1 and 128 characters'::TEXT, 0.000000::NUMERIC(10, 6), NULL::UUID;
    RETURN;
  END IF;

  -- 1. Auto-expire running requests that have exceeded their timeout
  UPDATE public.ai_requests AS ar
  SET status = 'expired',
      reserved_cost_usd = 0.000000,
      completed_at = v_now,
      error_message = 'Request timed out in running state'
  WHERE ar.user_id = p_user_id
    AND ar.status = 'running'
    AND (ar.expires_at IS NOT NULL AND ar.expires_at <= v_now);

  -- 2. Idempotency check: look up existing request by (user_id, request_id)
  SELECT ar.id, ar.status INTO v_existing
  FROM public.ai_requests AS ar
  WHERE ar.user_id = p_user_id AND ar.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.status = 'completed' THEN
      RETURN QUERY SELECT true, 'completed'::TEXT, NULL::TEXT, 'Request already completed'::TEXT, 0.000000::NUMERIC(10, 6), v_existing.id;
      RETURN;
    ELSIF v_existing.status = 'running' THEN
      RETURN QUERY SELECT false, 'conflict'::TEXT, 'CONFLICT'::TEXT, 'This assistant request is already running'::TEXT, 0.000000::NUMERIC(10, 6), v_existing.id;
      RETURN;
    ELSE
      RETURN QUERY SELECT false, v_existing.status::TEXT, 'ALREADY_PROCESSED'::TEXT, ('Request already finished with status: ' || v_existing.status)::TEXT, 0.000000::NUMERIC(10, 6), v_existing.id;
      RETURN;
    END IF;
  END IF;

  -- 3. Rate limit check: at most 6 requests per 60 seconds
  SELECT count(*) INTO v_rate_count
  FROM public.ai_requests
  WHERE user_id = p_user_id
    AND created_at >= (v_now - interval '60 seconds');

  IF v_rate_count >= 6 THEN
    INSERT INTO public.ai_requests (
      project_id, conversation_id, user_id, request_id, model,
      status, reserved_cost_usd, error_message, created_at, completed_at
    ) VALUES (
      p_project_id, p_conversation_id, p_user_id, p_request_id, p_model,
      'rate_limited', 0.000000, 'Rate limit exceeded: max 6 requests per 60s', v_now, v_now
    ) RETURNING id INTO v_new_id;

    RETURN QUERY SELECT false, 'rate_limited'::TEXT, 'RATE_LIMITED'::TEXT, 'Too many assistant requests. Please wait one minute.'::TEXT, 0.000000::NUMERIC(10, 6), v_new_id;
    RETURN;
  END IF;

  -- 4. Daily budget check: max USD 1.00 per rolling 24-hour window
  SELECT coalesce(sum(coalesce(cost_usd, 0.000000) + coalesce(reserved_cost_usd, 0.000000)), 0.000000)
  INTO v_daily_spend
  FROM public.ai_requests
  WHERE user_id = p_user_id
    AND created_at >= (v_now - interval '24 hours')
    AND status IN ('running', 'completed');

  IF (v_daily_spend + p_reservation_usd) > v_daily_limit THEN
    INSERT INTO public.ai_requests (
      project_id, conversation_id, user_id, request_id, model,
      status, reserved_cost_usd, error_message, created_at, completed_at
    ) VALUES (
      p_project_id, p_conversation_id, p_user_id, p_request_id, p_model,
      'budget_exceeded', 0.000000, 'Daily budget of USD 1.00 exceeded', v_now, v_now
    ) RETURNING id INTO v_new_id;

    RETURN QUERY SELECT false, 'budget_exceeded'::TEXT, 'BUDGET_EXCEEDED'::TEXT, 'Daily AI consumption budget of USD 1.00 reached. Please try tomorrow.'::TEXT, 0.000000::NUMERIC(10, 6), v_new_id;
    RETURN;
  END IF;

  -- 5. Successful claim: record in-flight request with reservation and expiration
  v_expires_at := v_now + (p_timeout_seconds || ' seconds')::interval;

  INSERT INTO public.ai_requests (
    project_id, conversation_id, user_id, request_id, model,
    status, reserved_cost_usd, expires_at, created_at
  ) VALUES (
    p_project_id, p_conversation_id, p_user_id, p_request_id, p_model,
    'running', p_reservation_usd, v_expires_at, v_now
  ) RETURNING id INTO v_new_id;

  RETURN QUERY SELECT true, 'running'::TEXT, NULL::TEXT, NULL::TEXT, p_reservation_usd, v_new_id;
END;
$$;

-- ============================================================================
-- 5. ATOMIC RPC: FINALIZE_ASSISTANT_REQUEST (SETTLE COST & RELEASE RESERVATION)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_assistant_request(
  p_request_id TEXT,
  p_user_id UUID,
  p_status TEXT,
  p_model TEXT DEFAULT NULL,
  p_prompt_tokens INTEGER DEFAULT 0,
  p_completion_tokens INTEGER DEFAULT 0,
  p_total_tokens INTEGER DEFAULT 0,
  p_cost_usd NUMERIC(10, 6) DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  status TEXT,
  final_cost_usd NUMERIC(10, 6),
  duration_ms INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_auth_user UUID;
  v_caller_role TEXT;
  v_target_id UUID;
  v_settled_cost NUMERIC(10, 6);
BEGIN
  -- Verify caller authorization
  v_auth_user := (SELECT auth.uid());
  v_caller_role := coalesce((SELECT auth.role()), current_user);
  IF v_auth_user IS NOT NULL AND v_auth_user <> p_user_id AND v_caller_role <> 'service_role' THEN
    RAISE EXCEPTION 'Cannot finalize request for another user' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('completed', 'failed', 'cancelled', 'rate_limited', 'expired') THEN
    RAISE EXCEPTION 'Invalid final status: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_target_id
  FROM public.ai_requests
  WHERE user_id = p_user_id AND request_id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request % not found for user %', p_request_id, p_user_id USING ERRCODE = 'P0002';
  END IF;

  v_settled_cost := coalesce(p_cost_usd, 0.000000);

  UPDATE public.ai_requests
  SET status = p_status,
      model = coalesce(p_model, model),
      prompt_tokens = coalesce(p_prompt_tokens, 0),
      completion_tokens = coalesce(p_completion_tokens, 0),
      total_tokens = coalesce(p_total_tokens, coalesce(p_prompt_tokens, 0) + coalesce(p_completion_tokens, 0)),
      cost_usd = v_settled_cost,
      reserved_cost_usd = 0.000000, -- Release reservation unconditionally
      duration_ms = p_duration_ms,
      completed_at = clock_timestamp(),
      error_message = p_error_message
  WHERE id = v_target_id;

  RETURN QUERY SELECT true, p_status, v_settled_cost, p_duration_ms;
END;
$$;

-- ============================================================================
-- 6. CACHE METRICS & OBSERVABILITY (STRUCTURE METADATA & TELEMETRY)
-- ============================================================================

ALTER TABLE public.structure_metadata
  ADD COLUMN IF NOT EXISTS hit_count INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.structure_cache_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdb_id VARCHAR(4) CHECK (pdb_id IS NULL OR pdb_id ~ '^[A-Z0-9]{4}$'),
  service TEXT NOT NULL CHECK (service IN ('rcsb', 'uniprot', 'structure_cache')),
  event_type TEXT NOT NULL CHECK (event_type IN ('hit', 'miss', 'refresh', 'error')),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_structure_cache_metrics_service_event
  ON public.structure_cache_metrics (service, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_structure_cache_metrics_pdb_id
  ON public.structure_cache_metrics (pdb_id, created_at DESC)
  WHERE pdb_id IS NOT NULL;

ALTER TABLE public.structure_cache_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "structure_cache_metrics_select"
  ON public.structure_cache_metrics
  FOR SELECT
  TO authenticated, service_role
  USING (true);

CREATE POLICY "structure_cache_metrics_insert"
  ON public.structure_cache_metrics
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

-- Telemetry recording RPC
CREATE OR REPLACE FUNCTION public.record_structure_cache_access(
  p_pdb_id TEXT,
  p_service TEXT,
  p_event_type TEXT,
  p_latency_ms INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_normalized VARCHAR(4);
BEGIN
  IF p_pdb_id IS NOT NULL THEN
    v_normalized := upper(trim(p_pdb_id));
  END IF;

  INSERT INTO public.structure_cache_metrics (
    pdb_id, service, event_type, latency_ms, error_message
  ) VALUES (
    v_normalized, p_service, p_event_type, p_latency_ms, p_error_message
  );

  IF v_normalized IS NOT NULL AND p_event_type = 'hit' THEN
    UPDATE public.structure_metadata
    SET hit_count = hit_count + 1,
        last_accessed_at = now()
    WHERE pdb_id = v_normalized;
  END IF;
END;
$$;

-- Observability aggregation view
CREATE OR REPLACE VIEW public.v_structure_cache_stats AS
SELECT
  service,
  count(*) AS total_requests,
  count(*) FILTER (WHERE event_type = 'hit') AS total_hits,
  count(*) FILTER (WHERE event_type = 'miss') AS total_misses,
  count(*) FILTER (WHERE event_type = 'error') AS total_errors,
  round(
    coalesce(
      (count(*) FILTER (WHERE event_type = 'hit'))::NUMERIC / nullif(count(*), 0) * 100,
      0
    ), 2
  ) AS hit_ratio_pct,
  round(avg(latency_ms)::NUMERIC, 2) AS avg_latency_ms
FROM public.structure_cache_metrics
GROUP BY service;

-- ============================================================================
-- 7. REPRODUCIBLE KNOWLEDGE INGESTION RPCS (MANIFEST SOURCES & CHUNKS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ingest_knowledge_source(
  p_id TEXT,
  p_title TEXT,
  p_publisher TEXT,
  p_url TEXT,
  p_license TEXT,
  p_retrieved_at DATE,
  p_sha256 TEXT,
  p_content_path TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.knowledge_sources (
    id, title, publisher, url, license, retrieved_at, content_path, sha256
  ) VALUES (
    p_id, p_title, p_publisher, p_url, p_license, p_retrieved_at, p_content_path, p_sha256
  )
  ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    publisher = EXCLUDED.publisher,
    url = EXCLUDED.url,
    license = EXCLUDED.license,
    retrieved_at = EXCLUDED.retrieved_at,
    content_path = EXCLUDED.content_path,
    sha256 = EXCLUDED.sha256;

  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_knowledge_chunk(
  p_source_id TEXT,
  p_chunk_index INTEGER,
  p_title TEXT,
  p_content TEXT,
  p_locator TEXT DEFAULT NULL,
  p_token_count INTEGER DEFAULT NULL,
  p_embedding extensions.vector(384) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chunk_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_sources WHERE id = p_source_id) THEN
    RAISE EXCEPTION 'Knowledge source "%" does not exist', p_source_id USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.knowledge_chunks (
    source_id, chunk_index, title, content, locator, token_count, embedding
  ) VALUES (
    p_source_id, p_chunk_index, p_title, p_content, p_locator, p_token_count, p_embedding
  )
  ON CONFLICT (source_id, chunk_index) DO UPDATE SET
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    locator = EXCLUDED.locator,
    token_count = EXCLUDED.token_count,
    embedding = coalesce(EXCLUDED.embedding, knowledge_chunks.embedding)
  RETURNING id INTO v_chunk_id;

  RETURN v_chunk_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_knowledge_batch(
  p_manifest JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source JSONB;
  v_chunk JSONB;
  v_count INTEGER := 0;
BEGIN
  IF p_manifest ? 'sources' THEN
    FOR v_source IN SELECT * FROM jsonb_array_elements(p_manifest->'sources')
    LOOP
      PERFORM public.ingest_knowledge_source(
        v_source->>'id',
        v_source->>'title',
        v_source->>'publisher',
        v_source->>'url',
        v_source->>'license',
        (v_source->>'retrieved_at')::DATE,
        v_source->>'sha256',
        v_source->>'content_path'
      );
    END LOOP;
  END IF;

  IF p_manifest ? 'chunks' THEN
    FOR v_chunk IN SELECT * FROM jsonb_array_elements(p_manifest->'chunks')
    LOOP
      PERFORM public.ingest_knowledge_chunk(
        v_chunk->>'source_id',
        (v_chunk->>'chunk_index')::INTEGER,
        v_chunk->>'title',
        v_chunk->>'content',
        v_chunk->>'locator',
        (v_chunk->>'token_count')::INTEGER,
        CASE
          WHEN v_chunk ? 'embedding' AND v_chunk->'embedding' IS NOT NULL AND jsonb_array_length(v_chunk->'embedding') > 0
          THEN (v_chunk->>'embedding')::extensions.vector(384)
          ELSE NULL
        END
      );
      v_count := v_count + 1;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

-- ============================================================================
-- 8. PRIVILEGES, GRANTS & LEAST-PRIVILEGE SECURITY
-- ============================================================================

-- Deny public / anon on all new functions and telemetry table
REVOKE ALL ON TABLE public.structure_cache_metrics FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_assistant_request FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_assistant_request FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_structure_cache_access FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ingest_knowledge_source FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_knowledge_chunk FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_knowledge_batch FROM PUBLIC, anon, authenticated;

-- Grant execution to authenticated and service_role for assistant lifecycle
GRANT EXECUTE ON FUNCTION public.claim_assistant_request TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_assistant_request TO authenticated, service_role;

-- Grant cache telemetry recording and stats view
GRANT SELECT, INSERT ON TABLE public.structure_cache_metrics TO authenticated, service_role;
GRANT SELECT ON public.v_structure_cache_stats TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_structure_cache_access TO authenticated, service_role;

-- Ingestion is an administrative / server task: strictly service_role only
GRANT EXECUTE ON FUNCTION public.ingest_knowledge_source TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_knowledge_chunk TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_knowledge_batch TO service_role;
