-- 20260901000003_create_conversations_and_messages.sql
-- BioFold 3D: Assistant Conversations and Messages

-- 1. Conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Assistant conversation' CHECK (char_length(trim(title)) >= 1 AND char_length(title) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_project_id_updated_at
  ON public.conversations (project_id, updated_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select_owner"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = conversations.project_id
        AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "conversations_insert_owner"
  ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = conversations.project_id
        AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "conversations_update_owner"
  ON public.conversations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = conversations.project_id
        AND projects.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = conversations.project_id
        AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "conversations_delete_owner"
  ON public.conversations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = conversations.project_id
        AND projects.owner_id = auth.uid()
    )
  );

CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 2. Messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL CHECK (char_length(content) <= 4000),
  citations JSONB,
  proposals JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at
  ON public.messages (conversation_id, created_at ASC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Read messages belonging to user's project
CREATE POLICY "messages_select_owner"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      JOIN public.projects ON projects.id = conversations.project_id
      WHERE conversations.id = messages.conversation_id
        AND projects.owner_id = auth.uid()
    )
  );

-- Only user-generated messages can be inserted from authenticated clients.
-- AI-generated ('assistant') and 'system' messages are rejected from browser clients
-- and must be written by backend/service_role only.
CREATE POLICY "messages_insert_user_only"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender = 'user'
    AND EXISTS (
      SELECT 1 FROM public.conversations
      JOIN public.projects ON projects.id = conversations.project_id
      WHERE conversations.id = messages.conversation_id
        AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "messages_delete_owner"
  ON public.messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      JOIN public.projects ON projects.id = conversations.project_id
      WHERE conversations.id = messages.conversation_id
        AND projects.owner_id = auth.uid()
    )
  );
