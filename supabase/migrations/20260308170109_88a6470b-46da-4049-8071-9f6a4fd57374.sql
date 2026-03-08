
-- Team chat messages table
CREATE TABLE public.team_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;

-- Project members + owner can read messages
CREATE POLICY "Project members can read team messages"
ON public.team_messages FOR SELECT TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE user_id = auth.uid()
  )
  OR project_id IN (
    SELECT project_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'accepted'
  )
);

-- Project members + owner can insert messages
CREATE POLICY "Project members can send team messages"
ON public.team_messages FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
    OR project_id IN (SELECT project_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'accepted')
  )
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
