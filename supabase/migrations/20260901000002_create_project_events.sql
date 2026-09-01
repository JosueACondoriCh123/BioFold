-- 20260901000002_create_project_events.sql
-- BioFold 3D: Project Activity and Audited Events

CREATE TABLE IF NOT EXISTS public.project_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  command TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('human', 'agent')),
  agent_kind TEXT CHECK (agent_kind IS NULL OR agent_kind IN ('webmcp', 'assistant')),
  approved_by_user BOOLEAN DEFAULT false,
  source_message_id UUID,
  status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'success', 'error')),
  evidence TEXT NOT NULL CHECK (evidence IN ('observed', 'calculated', 'heuristic', 'unavailable')),
  provenance JSONB,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  error JSONB,
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for event timeline queries and lookup
CREATE INDEX IF NOT EXISTS idx_project_events_project_id_created_at
  ON public.project_events (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_events_activity_id
  ON public.project_events (activity_id);

-- Enable Row Level Security
ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;

-- Project events are strictly scoped to the project owner
CREATE POLICY "project_events_select_owner"
  ON public.project_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_events.project_id
        AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "project_events_insert_owner"
  ON public.project_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_events.project_id
        AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "project_events_delete_owner"
  ON public.project_events
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = project_events.project_id
        AND projects.owner_id = auth.uid()
    )
  );
