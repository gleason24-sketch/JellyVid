-- pgcrypto lives in the "extensions" schema on Supabase, so digest() and
-- gen_random_bytes() are invisible to a function pinned to search_path=public.
-- Pin every jv_ function to public + extensions instead. Still explicit, still
-- immune to search_path hijacking, but able to see pgcrypto.
--
-- 0002 now creates the functions with the correct path; this migration exists
-- so databases created before that fix converge to the same state.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'jv\_%'
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
  end loop;
end $$;
