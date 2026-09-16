-- jv_wallet_json is an internal serialiser with no secret argument, so route
-- handlers cannot call it through the guarded RPC path. This is its public
-- face: same payload, with the app-secret check the other entry points have.
create or replace function jv_wallet_get(p_secret text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform jv_guard(p_secret);
  return jv_wallet_json(p_user_id);
end $$;

grant execute on function jv_wallet_get(text, uuid) to anon, authenticated;
