-- 20260903210000_public_sharing.sql
-- BioFold 3D: Public Project Sharing and Read-Only Access via Unique Share Tokens

-- 1. Alter active_pdb_id to support AlphaFold and longer identifiers
ALTER TABLE public.projects
  ALTER COLUMN active_pdb_id TYPE VARCHAR(32);

-- 2. Add sharing columns to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_projects_share_token
  ON public.projects (share_token)
  WHERE share_token IS NOT NULL;

-- 3. RLS Policies for Public Sharing (Read-only access)

-- Allow anyone (anonymous or authenticated) to view public projects by valid share_token
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'projects_select_public' AND tablename = 'projects'
  ) THEN
    CREATE POLICY "projects_select_public"
      ON public.projects
      FOR SELECT
      TO anon, authenticated
      USING (is_public = true AND share_token IS NOT NULL);
  END IF;

  -- Allow public viewing of events for shared projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'project_events_select_public' AND tablename = 'project_events'
  ) THEN
    CREATE POLICY "project_events_select_public"
      ON public.project_events
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.projects
          WHERE projects.id = project_events.project_id
            AND projects.is_public = true
            AND projects.share_token IS NOT NULL
        )
      );
  END IF;

  -- Allow public viewing of 3D annotations for shared projects
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'structure_annotations_select_public' AND tablename = 'structure_annotations'
  ) THEN
    CREATE POLICY "structure_annotations_select_public"
      ON public.structure_annotations
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.projects
          WHERE projects.id = structure_annotations.project_id
            AND projects.is_public = true
            AND projects.share_token IS NOT NULL
        )
      );
  END IF;
END $$;
