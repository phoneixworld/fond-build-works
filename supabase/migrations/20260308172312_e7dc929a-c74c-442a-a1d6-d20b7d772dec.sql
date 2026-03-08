
-- Plugin registry table
CREATE TABLE public.plugins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '',
  long_description text NOT NULL DEFAULT '',
  author text NOT NULL DEFAULT 'Community',
  category text NOT NULL DEFAULT 'ui',
  icon text NOT NULL DEFAULT 'puzzle',
  tags text[] NOT NULL DEFAULT '{}',
  downloads integer NOT NULL DEFAULT 0,
  rating numeric(2,1) NOT NULL DEFAULT 0.0,
  version text NOT NULL DEFAULT '1.0.0',
  files jsonb NOT NULL DEFAULT '[]',
  dependencies jsonb NOT NULL DEFAULT '[]',
  edge_functions jsonb NOT NULL DEFAULT '[]',
  required_secrets text[] NOT NULL DEFAULT '{}',
  is_official boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Installed plugins per project
CREATE TABLE public.installed_plugins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  plugin_id uuid REFERENCES public.plugins(id) ON DELETE CASCADE NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT now(),
  config jsonb NOT NULL DEFAULT '{}',
  UNIQUE(project_id, plugin_id)
);

-- RLS
ALTER TABLE public.plugins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installed_plugins ENABLE ROW LEVEL SECURITY;

-- Anyone can browse plugins
CREATE POLICY "Anyone can read plugins" ON public.plugins FOR SELECT USING (true);

-- Owners can manage installed plugins
CREATE POLICY "Owners manage installed plugins" ON public.installed_plugins FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
