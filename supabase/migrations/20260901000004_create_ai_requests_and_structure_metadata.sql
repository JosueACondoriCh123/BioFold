-- 20260901000004_create_ai_requests_and_structure_metadata.sql
-- BioFold 3D: AI Consumption Tracking and Structure Metadata Cache

-- 1. AI requests and consumption tracking
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  cost_usd NUMERIC(10, 6) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_user_id_created_at
  ON public.ai_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_requests_project_id
  ON public.ai_requests (project_id);

ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;

-- Users can inspect their own AI usage/requests
CREATE POLICY "ai_requests_select_own"
  ON public.ai_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Direct client write (INSERT, UPDATE, DELETE) is intentionally prohibited.
-- Only service_role (Edge Functions) can write AI consumption records.

-- 2. Structure metadata cache
CREATE TABLE IF NOT EXISTS public.structure_metadata (
  pdb_id VARCHAR(4) PRIMARY KEY CHECK (char_length(pdb_id) = 4),
  title TEXT,
  deposition_date DATE,
  release_date DATE,
  experimental_method TEXT,
  resolution NUMERIC(5, 2),
  chains JSONB,
  summary JSONB,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_structure_metadata_expires_at
  ON public.structure_metadata (expires_at);

ALTER TABLE public.structure_metadata ENABLE ROW LEVEL SECURITY;

-- Public read-only access for cached scientific metadata
CREATE POLICY "structure_metadata_select_all"
  ON public.structure_metadata
  FOR SELECT
  TO public
  USING (true);

-- Direct client mutation is prohibited; populated by backend service_role.
