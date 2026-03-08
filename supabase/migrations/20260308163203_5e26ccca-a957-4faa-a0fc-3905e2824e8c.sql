
-- Crew Spaces: workspace collaboration
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor', 'admin')),
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, email)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Project owners can manage members
CREATE POLICY "Owners manage workspace_members"
ON public.workspace_members
FOR ALL
TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Members can see their own invites
CREATE POLICY "Users can see own invites"
ON public.workspace_members
FOR SELECT
TO authenticated
USING (email = (SELECT email FROM profiles WHERE id = auth.uid()));

-- Members can update their own invite status
CREATE POLICY "Users can accept/decline invites"
ON public.workspace_members
FOR UPDATE
TO authenticated
USING (email = (SELECT email FROM profiles WHERE id = auth.uid()))
WITH CHECK (email = (SELECT email FROM profiles WHERE id = auth.uid()));
