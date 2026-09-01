-- 20260901000001_create_profiles_and_projects.sql
-- BioFold 3D: Profiles and Private Projects

-- 1. Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_policy"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 2. Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) >= 1 AND char_length(title) <= 120),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  active_pdb_id VARCHAR(4),
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_owner_id_updated_at
  ON public.projects (owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_active_pdb_id
  ON public.projects (active_pdb_id)
  WHERE active_pdb_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Strict ownership RLS policies
CREATE POLICY "projects_select_owner"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "projects_insert_owner"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "projects_update_owner"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "projects_delete_owner"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
