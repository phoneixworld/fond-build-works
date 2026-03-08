-- Tech stack column on projects
ALTER TABLE public.projects ADD COLUMN tech_stack text NOT NULL DEFAULT 'html-tailwind';

-- Per-project data store (Phase 1)
CREATE TABLE public.project_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  collection text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_data_lookup ON public.project_data(project_id, collection);
ALTER TABLE public.project_data ENABLE ROW LEVEL SECURITY;

-- Public access for project_data (apps call via edge function with project_id)
CREATE POLICY "Service role full access on project_data" ON public.project_data FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon can read project_data" ON public.project_data FOR SELECT TO anon USING (true);

-- Per-project users (Phase 2)
CREATE TABLE public.project_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL,
  display_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, email)
);
ALTER TABLE public.project_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on project_users" ON public.project_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Per-project schemas (visual builder)
CREATE TABLE public.project_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  collection_name text NOT NULL,
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, collection_name)
);
ALTER TABLE public.project_schemas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage project_schemas" ON public.project_schemas FOR ALL TO authenticated USING (
  project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
) WITH CHECK (
  project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);

-- Per-project custom functions (Phase 3)
CREATE TABLE public.project_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL DEFAULT '',
  trigger_type text NOT NULL DEFAULT 'http',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);
ALTER TABLE public.project_functions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage project_functions" ON public.project_functions FOR ALL TO authenticated USING (
  project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
) WITH CHECK (
  project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);