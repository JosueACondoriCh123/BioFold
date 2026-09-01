-- 20260901000005_create_knowledge_corpus.sql
-- BioFold 3D: Curated Knowledge Sources and Vector Chunks

-- 1. Knowledge sources table
CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL CHECK (publisher IN ('BioFold', 'RCSB PDB', 'UniProt')),
  url TEXT NOT NULL,
  license TEXT NOT NULL,
  retrieved_at DATE NOT NULL,
  content_path TEXT,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;

-- Read-only access for knowledge queries
CREATE POLICY "knowledge_sources_select_all"
  ON public.knowledge_sources
  FOR SELECT
  TO public
  USING (true);

-- Direct client mutation is prohibited. Only service_role can ingest corpus.

-- 2. Knowledge chunks with pgvector embeddings (384-dimensions for gte-small)
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  locator TEXT,
  token_count INTEGER CHECK (token_count IS NULL OR token_count >= 0),
  embedding extensions.vector(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_knowledge_chunks_source_index UNIQUE (source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_id
  ON public.knowledge_chunks (source_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON public.knowledge_chunks
  USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Read-only access for semantic search and retrieval
CREATE POLICY "knowledge_chunks_select_all"
  ON public.knowledge_chunks
  FOR SELECT
  TO public
  USING (true);

-- Direct client mutation is prohibited.
