-- 20260901000000_enable_extensions_and_helpers.sql
-- BioFold 3D: Enable pgvector and helper functions

-- 1. Enable pgvector for semantic knowledge embeddings (384-dimensional gte-small)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Generic updated_at timestamp trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
