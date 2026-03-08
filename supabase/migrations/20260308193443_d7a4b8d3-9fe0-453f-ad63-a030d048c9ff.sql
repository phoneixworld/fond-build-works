
-- Drop the overly permissive anonymous read policy on project_data
DROP POLICY IF EXISTS "Anon can read project_data" ON public.project_data;

-- Replace with: anonymous users can only read data from PUBLISHED projects
CREATE POLICY "Anon can read published project_data"
ON public.project_data FOR SELECT
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE is_published = true
  )
);

-- Add policy for authenticated project owners to manage their own data
CREATE POLICY "Owners manage own project_data"
ON public.project_data FOR ALL TO authenticated
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  project_id IN (
    SELECT id FROM public.projects WHERE user_id = auth.uid()
  )
);
