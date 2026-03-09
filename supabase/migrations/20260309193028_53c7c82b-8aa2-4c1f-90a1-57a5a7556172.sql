-- Drop the restrictive policy and recreate as permissive
DROP POLICY IF EXISTS "Anyone can read published projects" ON public.projects;

CREATE POLICY "Anyone can read published projects"
ON public.projects
FOR SELECT
TO anon, authenticated
USING (is_published = true);