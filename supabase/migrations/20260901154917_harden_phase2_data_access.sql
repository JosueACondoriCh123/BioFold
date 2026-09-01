-- BioFold 3D: security and contract corrections after Phase 2 branch integration.
-- This migration is intentionally additive so both external branches remain
-- reviewable from their original commits.

-- Trigger helpers do not need the caller's search path.
ALTER FUNCTION public.handle_updated_at() SET search_path = '';

-- Profiles are private account records. The original SELECT policy exposed
-- every display name to every authenticated user.
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Evaluate auth.uid() once per statement and keep ownership lookups indexable.
DROP POLICY IF EXISTS "projects_select_owner" ON public.projects;
CREATE POLICY "projects_select_owner" ON public.projects
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "projects_insert_owner" ON public.projects;
CREATE POLICY "projects_insert_owner" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "projects_update_owner" ON public.projects;
CREATE POLICY "projects_update_owner" ON public.projects
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "projects_delete_owner" ON public.projects;
CREATE POLICY "projects_delete_owner" ON public.projects
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "project_events_select_owner" ON public.project_events;
CREATE POLICY "project_events_select_owner" ON public.project_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_events.project_id
      AND projects.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "project_events_insert_owner" ON public.project_events;
CREATE POLICY "project_events_insert_owner" ON public.project_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_events.project_id
      AND projects.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "conversations_select_owner" ON public.conversations;
CREATE POLICY "conversations_select_owner" ON public.conversations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = conversations.project_id
      AND projects.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "conversations_insert_owner" ON public.conversations;
CREATE POLICY "conversations_insert_owner" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = conversations.project_id
      AND projects.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "conversations_update_owner" ON public.conversations;
CREATE POLICY "conversations_update_owner" ON public.conversations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = conversations.project_id
      AND projects.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = conversations.project_id
      AND projects.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "conversations_delete_owner" ON public.conversations;
CREATE POLICY "conversations_delete_owner" ON public.conversations
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = conversations.project_id
      AND projects.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "messages_select_owner" ON public.messages;
CREATE POLICY "messages_select_owner" ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.conversations
    JOIN public.projects ON projects.id = conversations.project_id
    WHERE conversations.id = messages.conversation_id
      AND projects.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "messages_insert_user_only" ON public.messages;
CREATE POLICY "messages_insert_user_only" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender = 'user'
    AND EXISTS (
      SELECT 1
      FROM public.conversations
      JOIN public.projects ON projects.id = conversations.project_id
      WHERE conversations.id = messages.conversation_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "ai_requests_select_own" ON public.ai_requests;
CREATE POLICY "ai_requests_select_own" ON public.ai_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- sourceMessageId is a public string contract. It may refer to a provider or
-- local message identifier and therefore must not be restricted to UUID text.
ALTER TABLE public.project_events
  ALTER COLUMN source_message_id TYPE TEXT
  USING source_message_id::TEXT;

UPDATE public.project_events
SET approved_by_user = false
WHERE approved_by_user IS NULL;

ALTER TABLE public.project_events
  ALTER COLUMN approved_by_user SET NOT NULL,
  DROP CONSTRAINT IF EXISTS project_events_status_check;

ALTER TABLE public.project_events
  ADD CONSTRAINT project_events_status_check
    CHECK (status IN ('success', 'error')),
  ADD CONSTRAINT project_events_activity_id_not_blank
    CHECK (char_length(trim(activity_id)) BETWEEN 1 AND 128),
  ADD CONSTRAINT project_events_command_audited
    CHECK (command IN (
      'load_structure',
      'get_structure_summary',
      'focus_residues',
      'set_representation',
      'show_surface',
      'measure_distance',
      'preview_mutation_context',
      'reset_workspace'
    )),
  ADD CONSTRAINT project_events_assistant_requires_confirmation
    CHECK (agent_kind <> 'assistant' OR approved_by_user = true);

-- A command produces exactly one durable audit event for a project.
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_events_project_activity
  ON public.project_events (project_id, activity_id);

-- The optional conversation foreign key participates in SET NULL and lookup
-- operations, so it needs its own index (Postgres does not add one for FKs).
CREATE INDEX IF NOT EXISTS idx_ai_requests_conversation_id
  ON public.ai_requests (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- Stored PDB references follow the same strict contract as the client.
ALTER TABLE public.projects
  ALTER COLUMN snapshot SET DEFAULT '{
    "schemaVersion": 1,
    "structure": null,
    "view": {"representation": "cartoon", "colorScheme": "chain", "camera": null},
    "surface": {"visible": false, "opacity": 0.72},
    "selectedResidues": []
  }'::jsonb,
  ADD CONSTRAINT projects_active_pdb_id_format
  CHECK (active_pdb_id IS NULL OR active_pdb_id ~ '^[A-Z0-9]{4}$');

ALTER TABLE public.structure_metadata
  ADD CONSTRAINT structure_metadata_pdb_id_format
  CHECK (pdb_id ~ '^[A-Z0-9]{4}$');

-- Audit entries and generated assistant messages are append-only from the
-- browser. Deleting their parent project/conversation still cascades normally.
DROP POLICY IF EXISTS "project_events_delete_owner" ON public.project_events;
DROP POLICY IF EXISTS "messages_delete_owner" ON public.messages;

-- The Data API no longer guarantees automatic exposure of SQL-created tables.
-- Grant only the operations that have corresponding RLS policies.
REVOKE ALL ON TABLE
  public.profiles,
  public.projects,
  public.project_events,
  public.conversations,
  public.messages,
  public.ai_requests,
  public.structure_metadata,
  public.knowledge_sources,
  public.knowledge_chunks
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT ON TABLE public.project_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversations TO authenticated;
GRANT SELECT, INSERT ON TABLE public.messages TO authenticated;
GRANT SELECT ON TABLE public.ai_requests TO authenticated;
GRANT SELECT ON TABLE public.structure_metadata TO anon, authenticated;
GRANT SELECT ON TABLE public.knowledge_sources TO anon, authenticated;
GRANT SELECT ON TABLE public.knowledge_chunks TO anon, authenticated;
