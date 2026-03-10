
-- Persistent KV cache table
CREATE TABLE public.cache_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cache_type text NOT NULL DEFAULT 'kv',
  cache_key text NOT NULL,
  cache_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_hash text,
  ttl_seconds integer NOT NULL DEFAULT 3600,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  UNIQUE(project_id, cache_type, cache_key)
);

-- Index for fast lookups
CREATE INDEX idx_cache_entries_lookup ON public.cache_entries(project_id, cache_type, cache_key);
CREATE INDEX idx_cache_entries_expiry ON public.cache_entries(expires_at);

-- Enable RLS
ALTER TABLE public.cache_entries ENABLE ROW LEVEL SECURITY;

-- Owners can manage their project's cache
CREATE POLICY "Owners manage cache_entries"
  ON public.cache_entries FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Members can read shared project cache
CREATE POLICY "Members can read shared cache_entries"
  ON public.cache_entries FOR SELECT TO authenticated
  USING (project_id IN (
    SELECT project_id FROM workspace_members
    WHERE user_id = auth.uid() AND status = 'accepted'
  ));

-- Service role full access
CREATE POLICY "Service role full access on cache_entries"
  ON public.cache_entries FOR ALL TO service_role
  USING (true) WITH CHECK (true);
