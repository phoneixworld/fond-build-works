
-- Auto-cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.cache_entries
  WHERE expires_at < now()
  RETURNING 1 INTO deleted_count;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Trigger to auto-cleanup on insert (piggyback cleanup)
CREATE OR REPLACE FUNCTION public.cache_insert_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On every 10th insert, clean up expired entries (probabilistic cleanup)
  IF (random() < 0.1) THEN
    DELETE FROM public.cache_entries WHERE expires_at < now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cache_cleanup
  AFTER INSERT ON public.cache_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.cache_insert_cleanup();
