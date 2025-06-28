-- Function to list tables and their RLS status
CREATE OR REPLACE FUNCTION list_table_rls()
RETURNS TABLE(table_name text, rls_enabled boolean, rls_forced boolean)
AS $$
  SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY table_name;
$$ LANGUAGE sql SECURITY DEFINER;
