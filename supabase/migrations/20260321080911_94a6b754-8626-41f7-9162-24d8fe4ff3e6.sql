
-- Table to track per-project database migrations
CREATE TABLE public.project_migrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL DEFAULT '',
  sql_up TEXT NOT NULL DEFAULT '',
  sql_down TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, version)
);

-- Table to track actual tables created per project
CREATE TABLE public.project_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  full_table_name TEXT NOT NULL,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  has_rls BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, table_name)
);

-- RLS for project_migrations
ALTER TABLE public.project_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage project_migrations" ON public.project_migrations
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on project_migrations" ON public.project_migrations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- RLS for project_tables
ALTER TABLE public.project_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage project_tables" ON public.project_tables
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on project_tables" ON public.project_tables
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
