
-- Allow workspace members to read projects they're invited to
CREATE POLICY "Members can read shared projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT project_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND status = 'accepted'
  )
);

-- Allow editor/admin members to update shared projects
CREATE POLICY "Editor members can update shared projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (
  id IN (
    SELECT project_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND status = 'accepted' AND role IN ('editor', 'admin')
  )
)
WITH CHECK (
  id IN (
    SELECT project_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND status = 'accepted' AND role IN ('editor', 'admin')
  )
);

-- Allow members to read build_jobs for shared projects
CREATE POLICY "Members can read shared build_jobs"
ON public.build_jobs
FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT project_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND status = 'accepted'
  )
);

-- Allow members to read project_data for shared projects
CREATE POLICY "Members can read shared project_data"
ON public.project_data
FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT project_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND status = 'accepted'
  )
);

-- Allow editor/admin members to manage project_data
CREATE POLICY "Editor members can manage shared project_data"
ON public.project_data
FOR ALL
TO authenticated
USING (
  project_id IN (
    SELECT project_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND status = 'accepted' AND role IN ('editor', 'admin')
  )
)
WITH CHECK (
  project_id IN (
    SELECT project_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND status = 'accepted' AND role IN ('editor', 'admin')
  )
);

-- Allow members to read deploy_history
CREATE POLICY "Members can read shared deploy_history"
ON public.deploy_history
FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT project_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND status = 'accepted'
  )
);

-- Allow members to read project_environments
CREATE POLICY "Members can read shared project_environments"
ON public.project_environments
FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT project_id FROM public.workspace_members
    WHERE user_id = auth.uid() AND status = 'accepted'
  )
);
