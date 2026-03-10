
-- Build Jobs table — tracks every build through the pipeline
CREATE TABLE public.build_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  source_files jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_files jsonb NOT NULL DEFAULT '{}'::jsonb,
  dependencies jsonb NOT NULL DEFAULT '{}'::jsonb,
  build_log text[] NOT NULL DEFAULT '{}'::text[],
  error text,
  build_duration_ms integer,
  artifact_path text,
  preview_url text,
  build_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_count integer NOT NULL DEFAULT 0,
  total_size_bytes integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

-- Indexes for performance
CREATE INDEX idx_build_jobs_project_id ON public.build_jobs(project_id);
CREATE INDEX idx_build_jobs_user_id ON public.build_jobs(user_id);
CREATE INDEX idx_build_jobs_status ON public.build_jobs(status);
CREATE INDEX idx_build_jobs_created_at ON public.build_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE public.build_jobs ENABLE ROW LEVEL SECURITY;

-- RLS: Owners can manage their build jobs
CREATE POLICY "Owners manage build_jobs"
  ON public.build_jobs
  FOR ALL
  TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Enable realtime for build status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.build_jobs;

-- Build artifacts storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('build-artifacts', 'build-artifacts', true);

-- Storage RLS: Owners can upload to their project path
CREATE POLICY "Owners upload build artifacts"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'build-artifacts' AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM projects WHERE user_id = auth.uid()
  ));

-- Storage RLS: Anyone can read build artifacts (for preview serving)
CREATE POLICY "Public read build artifacts"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'build-artifacts');

-- Storage RLS: Owners can delete their build artifacts
CREATE POLICY "Owners delete build artifacts"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'build-artifacts' AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM projects WHERE user_id = auth.uid()
  ));
