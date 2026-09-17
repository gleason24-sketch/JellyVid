-- Public gallery feed.
--
-- Deliberately public and secret-free, like jv_share_get and jv_stats: it
-- returns only what the owner already chose to publish, and never an identity.
create or replace function jv_gallery(p_limit integer default 24)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(row_to_json(g) order by g.created_at desc), '[]'::jsonb)
    from (
      select j.share_slug, j.task, j.tier, j.kind, j.model_id, j.prompt,
             coalesce(j.stored_url, j.output_url) as output_url,
             j.poster_url, j.created_at
        from jv_jobs j
       where j.is_public = true
         and j.status = 'completed'
         and coalesce(j.stored_url, j.output_url) is not null
       order by j.created_at desc
       limit least(coalesce(p_limit, 24), 60)
    ) g;
$$;

grant execute on function jv_gallery(integer) to anon, authenticated;
