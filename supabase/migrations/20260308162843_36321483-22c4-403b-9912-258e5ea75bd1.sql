
-- Pulse: visitor analytics for published apps
CREATE TABLE public.project_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event text NOT NULL DEFAULT 'pageview',
  path text NOT NULL DEFAULT '/',
  referrer text,
  user_agent text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_analytics ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (tracking pixel from published apps)
CREATE POLICY "Anyone can insert analytics"
ON public.project_analytics
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only project owners can read analytics
CREATE POLICY "Owners can read analytics"
ON public.project_analytics
FOR SELECT
TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Index for fast queries
CREATE INDEX idx_project_analytics_project_date ON public.project_analytics(project_id, created_at DESC);
