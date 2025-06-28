-- Function to get all public tables
CREATE OR REPLACE FUNCTION get_tables()
RETURNS SETOF text AS $$
BEGIN
  RETURN QUERY 
  SELECT table_name::text
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
