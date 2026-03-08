
-- Project Environments (Dev/Staging/Production)
CREATE TABLE public.project_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'development',
  label text NOT NULL DEFAULT 'Development',
  status text NOT NULL DEFAULT 'active',
  html_snapshot text NOT NULL DEFAULT '',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  deployed_at timestamptz,
  deployed_by uuid,
  preview_url text,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);

ALTER TABLE public.project_environments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage project_environments"
ON public.project_environments FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Deploy History / Audit Log
CREATE TABLE public.deploy_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  from_env text NOT NULL DEFAULT 'development',
  to_env text NOT NULL DEFAULT 'staging',
  deployed_by uuid NOT NULL,
  deployed_by_email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'success',
  notes text NOT NULL DEFAULT '',
  snapshot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deploy_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read deploy_history"
ON public.deploy_history FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Owners insert deploy_history"
ON public.deploy_history FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
