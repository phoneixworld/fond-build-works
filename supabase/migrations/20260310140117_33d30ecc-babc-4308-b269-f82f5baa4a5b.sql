
-- Drop all existing restrictive policies on projects
DROP POLICY IF EXISTS "Anyone can read published projects" ON public.projects;
DROP POLICY IF EXISTS "Editor members can update shared projects" ON public.projects;
DROP POLICY IF EXISTS "Members can read shared projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can read own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;

-- Recreate as PERMISSIVE (default) to avoid infinite recursion
CREATE POLICY "Users can read own projects" ON public.projects
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own projects" ON public.projects
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Anyone can read published projects" ON public.projects
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "Members can read shared projects" ON public.projects
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT wm.project_id FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid() AND wm.status = 'accepted'
  ));

CREATE POLICY "Editor members can update shared projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (id IN (
    SELECT wm.project_id FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid() AND wm.status = 'accepted'
    AND wm.role IN ('editor', 'admin')
  ))
  WITH CHECK (id IN (
    SELECT wm.project_id FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid() AND wm.status = 'accepted'
    AND wm.role IN ('editor', 'admin')
  ));

-- Also fix workspace_members policies that reference projects (causing the recursion)
DROP POLICY IF EXISTS "Owners manage workspace_members" ON public.workspace_members;

CREATE POLICY "Owners manage workspace_members" ON public.workspace_members
  FOR ALL TO authenticated
  USING (invited_by = auth.uid())
  WITH CHECK (invited_by = auth.uid());
