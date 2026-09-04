-- 20260903200000_storage_and_annotations.sql
-- BioFold 3D: Cloud Storage for Molecular Files & 3D Persistent Bookmarks

-- 1. Create storage bucket for molecular structure files (PDB / CIF)
INSERT INTO storage.buckets (id, name, public)
VALUES ('molecular-files', 'molecular-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
-- Allow authenticated users to upload their own molecular files under their user_id prefix
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can upload own molecular files' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can upload own molecular files"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'molecular-files' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own molecular files' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can read own molecular files"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'molecular-files' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own molecular files' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Users can delete own molecular files"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'molecular-files' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- 2. Structure 3D Annotations & Persistent Bookmarks
CREATE TABLE IF NOT EXISTS public.structure_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pdb_id TEXT NOT NULL,
  chain TEXT NOT NULL,
  residue_number INTEGER NOT NULL,
  position_xyz JSONB NOT NULL DEFAULT '{"x":0,"y":0,"z":0}'::jsonb,
  note TEXT NOT NULL CHECK (char_length(trim(note)) >= 1 AND char_length(note) <= 2000),
  color TEXT NOT NULL DEFAULT '#5ccfb5' CHECK (char_length(color) <= 30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries by project, structure or user
CREATE INDEX IF NOT EXISTS idx_structure_annotations_user_pdb
  ON public.structure_annotations (user_id, pdb_id);

CREATE INDEX IF NOT EXISTS idx_structure_annotations_project_id
  ON public.structure_annotations (project_id)
  WHERE project_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.structure_annotations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Authenticated users can manage only their own annotations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'structure_annotations_select_own' AND tablename = 'structure_annotations'
  ) THEN
    CREATE POLICY "structure_annotations_select_own"
      ON public.structure_annotations
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'structure_annotations_insert_own' AND tablename = 'structure_annotations'
  ) THEN
    CREATE POLICY "structure_annotations_insert_own"
      ON public.structure_annotations
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'structure_annotations_update_own' AND tablename = 'structure_annotations'
  ) THEN
    CREATE POLICY "structure_annotations_update_own"
      ON public.structure_annotations
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'structure_annotations_delete_own' AND tablename = 'structure_annotations'
  ) THEN
    CREATE POLICY "structure_annotations_delete_own"
      ON public.structure_annotations
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS set_structure_annotations_updated_at ON public.structure_annotations;
CREATE TRIGGER set_structure_annotations_updated_at
  BEFORE UPDATE ON public.structure_annotations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
