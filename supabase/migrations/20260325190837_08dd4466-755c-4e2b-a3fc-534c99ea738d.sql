
-- Container builds table: tracks each containerized build
CREATE TABLE public.container_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'provisioning', 'building', 'testing', 'publishing', 'complete', 'failed', 'cancelled')),
  
  -- Input
  source_files JSONB NOT NULL DEFAULT '{}'::jsonb,
  dependencies JSONB NOT NULL DEFAULT '{}'::jsonb,
  build_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Azure Container Apps metadata
  azure_job_name TEXT,
  azure_execution_id TEXT,
  container_image TEXT,
  
  -- Output
  output_files JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_url TEXT,
  artifact_path TEXT,
  build_log TEXT[] NOT NULL DEFAULT '{}',
  error TEXT,
  
  -- Metrics
  file_count INTEGER NOT NULL DEFAULT 0,
  total_size_bytes INTEGER NOT NULL DEFAULT 0,
  build_duration_ms INTEGER,
  
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DAG tasks table: individual tasks within a build
CREATE TABLE public.container_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID REFERENCES public.container_builds(id) ON DELETE CASCADE NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('install', 'lint', 'typecheck', 'test', 'build', 'publish')),
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'passed', 'failed', 'skipped')),
  depends_on UUID[],
  
  -- Task output
  output TEXT,
  error TEXT,
  exit_code INTEGER,
  duration_ms INTEGER,
  
  -- Ordering
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_container_builds_project ON public.container_builds(project_id);
CREATE INDEX idx_container_builds_status ON public.container_builds(status);
CREATE INDEX idx_container_tasks_build ON public.container_tasks(build_id);
CREATE INDEX idx_container_tasks_status ON public.container_tasks(status);

-- RLS
ALTER TABLE public.container_builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.container_tasks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own builds
CREATE POLICY "Users can view own builds" ON public.container_builds
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own builds" ON public.container_builds
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Tasks readable if user owns the parent build
CREATE POLICY "Users can view own build tasks" ON public.container_tasks
  FOR SELECT TO authenticated
  USING (build_id IN (SELECT id FROM public.container_builds WHERE user_id = auth.uid()));

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access builds" ON public.container_builds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access tasks" ON public.container_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Enable realtime for live build streaming
ALTER PUBLICATION supabase_realtime ADD TABLE public.container_builds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.container_tasks;
