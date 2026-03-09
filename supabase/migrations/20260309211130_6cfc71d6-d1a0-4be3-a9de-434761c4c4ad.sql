
-- Email config per project (provider selection + credentials)
CREATE TABLE public.project_email_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mock',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  from_name text NOT NULL DEFAULT '',
  from_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

ALTER TABLE public.project_email_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage project_email_config"
  ON public.project_email_config FOR ALL
  TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on project_email_config"
  ON public.project_email_config FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Email templates per project
CREATE TABLE public.project_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  html_body text NOT NULL DEFAULT '',
  text_body text NOT NULL DEFAULT '',
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

ALTER TABLE public.project_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage project_email_templates"
  ON public.project_email_templates FOR ALL
  TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on project_email_templates"
  ON public.project_email_templates FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Email send log
CREATE TABLE public.project_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  template_name text NOT NULL DEFAULT '',
  to_email text NOT NULL,
  subject text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'sent',
  provider text NOT NULL DEFAULT 'mock',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read project_email_log"
  ON public.project_email_log FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Service role full access on project_email_log"
  ON public.project_email_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
