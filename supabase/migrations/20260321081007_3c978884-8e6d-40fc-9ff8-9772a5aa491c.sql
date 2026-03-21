
-- Function to execute DDL statements (used by project-db edge function)
CREATE OR REPLACE FUNCTION public.exec_ddl(ddl_sql TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  EXECUTE ddl_sql;
END;
$$;

-- Restrict to service_role only
REVOKE ALL ON FUNCTION public.exec_ddl(TEXT) FROM public;
REVOKE ALL ON FUNCTION public.exec_ddl(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.exec_ddl(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exec_ddl(TEXT) TO service_role;
