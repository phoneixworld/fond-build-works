ALTER TABLE public.projects ADD COLUMN is_published boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN published_slug text UNIQUE;

CREATE POLICY "Anyone can read published projects"
ON public.projects
FOR SELECT
TO anon, authenticated
USING (is_published = true);