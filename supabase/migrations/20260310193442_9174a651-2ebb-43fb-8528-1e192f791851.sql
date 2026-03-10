
-- 1. Conversation State — durable, versioned, multi-agent accessible
CREATE TABLE public.project_conversation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  mode text NOT NULL DEFAULT 'idle',
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  agent_states jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, version)
);

-- 2. Structured Requirements — parsed, normalized, versioned
CREATE TABLE public.project_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  phase_number integer NOT NULL DEFAULT 1,
  raw_text text NOT NULL DEFAULT '',
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  ir_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  has_images boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Project Context — persistent, cross-session, multi-device
CREATE TABLE public.project_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  context_type text NOT NULL DEFAULT 'conversation',
  context_key text NOT NULL DEFAULT '',
  context_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, context_type, context_key)
);

-- 4. Audit Log — every phase, every action, timestamped, attributed, diffable
CREATE TABLE public.project_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid,
  agent_name text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Build Readiness — compiler-style validation results
CREATE TABLE public.project_build_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  is_ready boolean NOT NULL DEFAULT false,
  score integer NOT NULL DEFAULT 0,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  incomplete_workflows jsonb NOT NULL DEFAULT '[]'::jsonb,
  unresolved_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  underspecified_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

-- RLS for all new tables
ALTER TABLE public.project_conversation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_build_readiness ENABLE ROW LEVEL SECURITY;

-- Owner policies
CREATE POLICY "Owners manage conversation_state" ON public.project_conversation_state FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Owners manage requirements" ON public.project_requirements FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Owners manage context" ON public.project_context FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Owners manage audit_log" ON public.project_audit_log FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Owners manage build_readiness" ON public.project_build_readiness FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Service role access for edge functions
CREATE POLICY "Service role access conversation_state" ON public.project_conversation_state FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access requirements" ON public.project_requirements FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access context" ON public.project_context FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access audit_log" ON public.project_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role access build_readiness" ON public.project_build_readiness FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Member read access
CREATE POLICY "Members read conversation_state" ON public.project_conversation_state FOR SELECT TO authenticated
  USING (project_id IN (SELECT project_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'accepted'));
CREATE POLICY "Members read requirements" ON public.project_requirements FOR SELECT TO authenticated
  USING (project_id IN (SELECT project_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'accepted'));
CREATE POLICY "Members read context" ON public.project_context FOR SELECT TO authenticated
  USING (project_id IN (SELECT project_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'accepted'));
CREATE POLICY "Members read audit_log" ON public.project_audit_log FOR SELECT TO authenticated
  USING (project_id IN (SELECT project_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'accepted'));
CREATE POLICY "Members read build_readiness" ON public.project_build_readiness FOR SELECT TO authenticated
  USING (project_id IN (SELECT project_id FROM workspace_members WHERE user_id = auth.uid() AND status = 'accepted'));
