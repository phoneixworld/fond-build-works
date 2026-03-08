
-- 1. Project Decisions (Memory Substrate)
CREATE TABLE public.project_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage project_decisions"
ON public.project_decisions FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- 2. Project Dependencies (Dependency Graph)
CREATE TABLE public.project_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'file',
  source_name text NOT NULL DEFAULT '',
  target_type text NOT NULL DEFAULT 'file',
  target_name text NOT NULL DEFAULT '',
  relationship text NOT NULL DEFAULT 'imports',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage project_dependencies"
ON public.project_dependencies FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- 3. Project Governance Rules
CREATE TABLE public.project_governance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'naming',
  name text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  rule_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'warning',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_governance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage project_governance_rules"
ON public.project_governance_rules FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
