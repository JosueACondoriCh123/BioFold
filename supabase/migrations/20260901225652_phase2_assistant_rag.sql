-- BioFold 3D Phase 2.2: durable Assistant requests and hybrid retrieval.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD CONSTRAINT messages_request_id_not_blank
    CHECK (request_id IS NULL OR char_length(trim(request_id)) BETWEEN 1 AND 128);

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_conversation_request_sender
  ON public.messages (conversation_id, request_id, sender)
  WHERE request_id IS NOT NULL;

ALTER TABLE public.ai_requests
  DROP CONSTRAINT IF EXISTS ai_requests_status_check,
  DROP CONSTRAINT IF EXISTS ai_requests_request_id_key;

ALTER TABLE public.ai_requests
  ADD CONSTRAINT ai_requests_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'rate_limited')),
  ADD CONSTRAINT ai_requests_request_id_not_blank
    CHECK (char_length(trim(request_id)) BETWEEN 1 AND 128);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_requests_user_request
  ON public.ai_requests (user_id, request_id);

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS fts TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts
  ON public.knowledge_chunks USING GIN (fts);

CREATE OR REPLACE FUNCTION public.hybrid_search_knowledge(
  query_text TEXT,
  query_embedding extensions.vector(384) DEFAULT NULL,
  match_count INTEGER DEFAULT 6,
  full_text_weight DOUBLE PRECISION DEFAULT 1,
  semantic_weight DOUBLE PRECISION DEFAULT 1,
  rrf_k INTEGER DEFAULT 50
)
RETURNS TABLE (
  chunk_id UUID,
  source_id TEXT,
  title TEXT,
  content TEXT,
  locator TEXT,
  publisher TEXT,
  url TEXT,
  retrieved_at DATE,
  score DOUBLE PRECISION
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH full_text AS (
    SELECT
      kc.id,
      row_number() OVER (
        ORDER BY ts_rank_cd(kc.fts, websearch_to_tsquery('english', query_text)) DESC
      ) AS rank
    FROM public.knowledge_chunks AS kc
    WHERE trim(query_text) <> ''
      AND kc.fts @@ websearch_to_tsquery('english', query_text)
    ORDER BY rank
    LIMIT LEAST(GREATEST(match_count, 1), 10) * 4
  ),
  semantic AS (
    SELECT
      kc.id,
      row_number() OVER (ORDER BY kc.embedding OPERATOR(extensions.<=>) query_embedding) AS rank
    FROM public.knowledge_chunks AS kc
    WHERE query_embedding IS NOT NULL
      AND kc.embedding IS NOT NULL
    ORDER BY rank
    LIMIT LEAST(GREATEST(match_count, 1), 10) * 4
  ),
  candidates AS (
    SELECT id FROM full_text
    UNION
    SELECT id FROM semantic
  ),
  ranked AS (
    SELECT
      candidates.id,
      coalesce(full_text_weight / (rrf_k + full_text.rank), 0) +
      coalesce(semantic_weight / (rrf_k + semantic.rank), 0) AS score
    FROM candidates
    LEFT JOIN full_text USING (id)
    LEFT JOIN semantic USING (id)
  )
  SELECT
    kc.id,
    kc.source_id,
    kc.title,
    kc.content,
    kc.locator,
    ks.publisher,
    ks.url,
    ks.retrieved_at,
    ranked.score
  FROM ranked
  JOIN public.knowledge_chunks AS kc ON kc.id = ranked.id
  JOIN public.knowledge_sources AS ks ON ks.id = kc.source_id
  ORDER BY ranked.score DESC, kc.id
  LIMIT LEAST(GREATEST(match_count, 1), 10);
$$;

-- Retrieval is a server concern. Browser clients can read curated records but
-- cannot invoke the ranked search surface directly.
REVOKE ALL ON FUNCTION public.hybrid_search_knowledge(
  TEXT, extensions.vector, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hybrid_search_knowledge(
  TEXT, extensions.vector, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER
) TO service_role;
