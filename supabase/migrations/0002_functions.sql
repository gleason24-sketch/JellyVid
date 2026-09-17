-- JellyVid access layer. Every mutation is a SECURITY DEFINER function that
-- demands the shared app secret, so the publishable anon key alone grants
-- nothing. Credit math is done inside single statements: a spend is a
-- conditional UPDATE that fails closed, and a refund is protected by a unique
-- index, so double-spends and double-refunds are impossible by construction.

-- ----------------------------------------------------------------- guard ---
create or replace function jv_guard(p_secret text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  select value into v_hash from jv_config where key = 'app_secret_sha256';
  if v_hash is null then
    raise exception 'app_secret_not_configured' using errcode = 'P0001';
  end if;
  if p_secret is null
     or encode(digest(p_secret, 'sha256'), 'hex') is distinct from v_hash then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;
end $$;

create or replace function jv_set_app_secret(p_current text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from jv_config where key = 'app_secret_sha256') then
    perform jv_guard(p_current);
  end if;
  insert into jv_config (key, value)
  values ('app_secret_sha256', encode(digest(p_new, 'sha256'), 'hex'))
  on conflict (key) do update set value = excluded.value;
end $$;

-- ------------------------------------------------------------ serialisers ---
create or replace function jv_wallet_json(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'balance_credits',    w.balance_credits,
    'lifetime_granted',   w.lifetime_granted,
    'lifetime_purchased', w.lifetime_purchased,
    'lifetime_spent',     w.lifetime_spent,
    'lifetime_refunded',  w.lifetime_refunded,
    -- Stated in the payload itself so every surface that renders a balance
    -- carries the promise with it.
    'expires_at',         null,
    'never_expires',      true
  ) from jv_wallets w where w.user_id = p_user_id;
$$;

create or replace function jv_job_json(j jv_jobs)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', j.id, 'task', j.task, 'tier', j.tier, 'kind', j.kind,
    'model_id', j.model_id, 'prompt', j.prompt, 'params', j.params,
    'input_url', j.input_url, 'cost_credits', j.cost_credits,
    'status', j.status, 'output_url', coalesce(j.stored_url, j.output_url),
    'poster_url', j.poster_url, 'phash', j.phash,
    'duplicate_of', j.duplicate_of, 'error_reason', j.error_reason,
    'error_code', j.error_code, 'refunded', j.refunded,
    'refund_reason', j.refund_reason, 'parent_job_id', j.parent_job_id,
    'share_slug', j.share_slug, 'is_public', j.is_public,
    'consent_at', j.consent_at, 'attempts', j.attempts,
    'created_at', j.created_at, 'submitted_at', j.submitted_at,
    'completed_at', j.completed_at
  );
$$;

-- ------------------------------------------------------------------ users ---
create or replace function jv_bootstrap(
  p_secret text, p_ip_hash text, p_grant integer, p_recovery_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user jv_users; v_grant integer := greatest(coalesce(p_grant, 0), 0);
begin
  perform jv_guard(p_secret);
  insert into jv_users (signup_ip_hash, recovery_code_hash)
  values (p_ip_hash, p_recovery_hash)
  returning * into v_user;

  insert into jv_wallets (user_id, balance_credits, lifetime_granted)
  values (v_user.id, v_grant, v_grant);

  if v_grant > 0 then
    insert into jv_ledger (user_id, kind, amount_credits, balance_after, reason)
    values (v_user.id, 'grant', v_grant, v_grant, 'Welcome credits. These never expire.');
  end if;

  insert into jv_events (user_id, name) values (v_user.id, 'signup');

  return jsonb_build_object(
    'id', v_user.id, 'email', v_user.email, 'created_at', v_user.created_at,
    'wallet', jv_wallet_json(v_user.id));
end $$;

create or replace function jv_user_get(p_secret text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_user jv_users;
begin
  perform jv_guard(p_secret);
  select * into v_user from jv_users where id = p_user_id;
  if not found then return null; end if;
  update jv_users set last_seen_at = now() where id = p_user_id;
  return jsonb_build_object(
    'id', v_user.id, 'email', v_user.email, 'created_at', v_user.created_at,
    'has_recovery_code', v_user.recovery_code_hash is not null,
    'wallet', jv_wallet_json(v_user.id));
end $$;

create or replace function jv_user_claim(
  p_secret text, p_user_id uuid, p_email text, p_recovery_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform jv_guard(p_secret);
  if exists (select 1 from jv_users where email = lower(p_email) and id <> p_user_id) then
    raise exception 'email_taken' using errcode = 'P0001';
  end if;
  update jv_users
     set email = lower(p_email),
         recovery_code_hash = coalesce(p_recovery_hash, recovery_code_hash)
   where id = p_user_id;
  insert into jv_events (user_id, name) values (p_user_id, 'account_claimed');
  return jv_user_get(p_secret, p_user_id);
end $$;

create or replace function jv_user_restore(
  p_secret text, p_email text, p_recovery_hash text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform jv_guard(p_secret);
  select id into v_id from jv_users
   where email = lower(p_email) and recovery_code_hash = p_recovery_hash;
  if not found then return null; end if;
  return jv_user_get(p_secret, v_id);
end $$;

-- ----------------------------------------------------------------- credit ---
create or replace function jv_credit(
  p_secret text, p_user_id uuid, p_kind jv_ledger_kind,
  p_amount integer, p_reason text, p_external_ref text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_balance integer;
begin
  perform jv_guard(p_secret);
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;

  -- Idempotent on external_ref so a replayed payment webhook cannot double-credit.
  if p_external_ref is not null
     and exists (select 1 from jv_ledger where external_ref = p_external_ref) then
    return jv_wallet_json(p_user_id);
  end if;

  update jv_wallets
     set balance_credits    = balance_credits + p_amount,
         lifetime_granted   = lifetime_granted   + case when p_kind = 'grant'    then p_amount else 0 end,
         lifetime_purchased = lifetime_purchased + case when p_kind = 'purchase' then p_amount else 0 end,
         updated_at = now()
   where user_id = p_user_id
   returning balance_credits into v_balance;
  if not found then raise exception 'wallet_not_found'; end if;

  insert into jv_ledger (user_id, kind, amount_credits, balance_after, reason, external_ref)
  values (p_user_id, p_kind, p_amount, v_balance, p_reason, p_external_ref);

  if p_kind = 'purchase' then
    insert into jv_events (user_id, name, props)
    values (p_user_id, 'purchase', jsonb_build_object('credits', p_amount));
  end if;

  return jv_wallet_json(p_user_id);
end $$;

-- ------------------------------------------------------------------- jobs ---
create or replace function jv_job_create(
  p_secret text, p_user_id uuid, p_task text, p_tier text, p_kind text,
  p_model_id text, p_endpoint text, p_prompt text, p_prompt_key text,
  p_params jsonb, p_input_url text, p_cost integer,
  p_consent_at timestamptz, p_parent_job_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_balance integer; v_job jv_jobs; v_first boolean;
begin
  perform jv_guard(p_secret);

  -- Conditional debit: if the balance is short, no row matches and nothing moves.
  update jv_wallets
     set balance_credits = balance_credits - p_cost,
         lifetime_spent  = lifetime_spent + p_cost,
         updated_at = now()
   where user_id = p_user_id and balance_credits >= p_cost
   returning balance_credits into v_balance;
  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  insert into jv_jobs (user_id, task, tier, kind, model_id, endpoint, prompt,
                       prompt_key, params, input_url, cost_credits, consent_at,
                       parent_job_id)
  values (p_user_id, p_task, p_tier, p_kind, p_model_id, p_endpoint, p_prompt,
          p_prompt_key, coalesce(p_params, '{}'::jsonb), p_input_url, p_cost,
          p_consent_at, p_parent_job_id)
  returning * into v_job;

  insert into jv_ledger (user_id, kind, amount_credits, balance_after, reason, job_id)
  values (p_user_id, 'spend', -p_cost, v_balance,
          initcap(p_tier) || ' ' || p_kind || ' · ' || p_model_id, v_job.id);

  select count(*) = 1 into v_first from jv_jobs where user_id = p_user_id;
  insert into jv_events (user_id, name, props)
  values (p_user_id, case when v_first then 'first_generation' else 'generation' end,
          jsonb_build_object('tier', p_tier, 'kind', p_kind, 'model', p_model_id));

  return jsonb_build_object('job', jv_job_json(v_job), 'wallet', jv_wallet_json(p_user_id));
end $$;

create or replace function jv_job_submitted(
  p_secret text, p_job_id uuid, p_request_id text,
  p_status_url text, p_cancel_url text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_job jv_jobs;
begin
  perform jv_guard(p_secret);
  update jv_jobs
     set provider_request_id = p_request_id,
         provider_status_url = p_status_url,
         provider_cancel_url = p_cancel_url,
         status = 'in_progress', submitted_at = now(),
         attempts = attempts + 1, updated_at = now()
   where id = p_job_id returning * into v_job;
  return jv_job_json(v_job);
end $$;

-- Finds an earlier successful output by the same user for the same prompt whose
-- perceptual hash is within p_distance bits. This is complaint #4: a paid
-- re-roll that hands back the picture you already have.
create or replace function jv_find_duplicate(
  p_secret text, p_user_id uuid, p_job_id uuid,
  p_prompt_key text, p_phash text, p_distance integer default 5)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform jv_guard(p_secret);
  if p_phash is null or length(p_phash) <> 16 then return null; end if;
  select id into v_id from jv_jobs
   where user_id = p_user_id
     and id <> p_job_id
     and status = 'completed'
     and refunded = false
     and prompt_key = p_prompt_key
     and phash is not null and length(phash) = 16
     and bit_count(('x' || phash)::bit(64) # ('x' || p_phash)::bit(64)) <= p_distance
   order by created_at asc limit 1;
  return v_id;
end $$;

-- Single terminal transition for a job. Any non-delivering outcome refunds the
-- full cost here, in the same statement that records it, so a refund can never
-- be forgotten or applied twice.
create or replace function jv_job_finalize(
  p_secret text, p_job_id uuid, p_status jv_job_status,
  p_output_url text default null, p_stored_url text default null,
  p_poster_url text default null, p_phash text default null,
  p_sha text default null, p_error_reason text default null,
  p_error_code text default null, p_duplicate_of uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_job jv_jobs; v_balance integer; v_refund boolean; v_reason text;
begin
  perform jv_guard(p_secret);

  select * into v_job from jv_jobs where id = p_job_id for update;
  if not found then raise exception 'job_not_found'; end if;
  if v_job.status in ('completed','failed','nsfw','canceled','timeout','duplicate') then
    return jv_job_json(v_job);                       -- already terminal; idempotent
  end if;

  update jv_jobs
     set status = p_status,
         output_url = coalesce(p_output_url, output_url),
         stored_url = coalesce(p_stored_url, stored_url),
         poster_url = coalesce(p_poster_url, poster_url),
         phash = coalesce(p_phash, phash),
         content_sha256 = coalesce(p_sha, content_sha256),
         error_reason = coalesce(p_error_reason, error_reason),
         error_code = coalesce(p_error_code, error_code),
         duplicate_of = coalesce(p_duplicate_of, duplicate_of),
         completed_at = now(), updated_at = now()
   where id = p_job_id returning * into v_job;

  v_refund := p_status in ('failed','nsfw','canceled','timeout','duplicate');
  if v_refund and not v_job.refunded and v_job.cost_credits > 0 then
    v_reason := case p_status
      when 'nsfw'      then 'Moderation block — you were not charged.'
      when 'duplicate' then 'Duplicate output, refunded.'
      when 'timeout'   then 'Timed out, refunded automatically.'
      when 'canceled'  then 'Canceled before it ran, refunded.'
      else                  'Generation failed, refunded automatically.'
    end;

    update jv_wallets
       set balance_credits   = balance_credits + v_job.cost_credits,
           lifetime_refunded = lifetime_refunded + v_job.cost_credits,
           lifetime_spent    = greatest(lifetime_spent - v_job.cost_credits, 0),
           updated_at = now()
     where user_id = v_job.user_id returning balance_credits into v_balance;

    insert into jv_ledger (user_id, kind, amount_credits, balance_after, reason, job_id)
    values (v_job.user_id, 'refund', v_job.cost_credits, v_balance, v_reason, v_job.id)
    on conflict do nothing;

    update jv_jobs set refunded = true, refund_reason = v_reason
     where id = p_job_id returning * into v_job;

    insert into jv_events (user_id, name, props)
    values (v_job.user_id, 'auto_refund',
            jsonb_build_object('credits', v_job.cost_credits, 'status', p_status));
  end if;

  return jv_job_json(v_job);
end $$;

create or replace function jv_job_get(p_secret text, p_job_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_job jv_jobs;
begin
  perform jv_guard(p_secret);
  select * into v_job from jv_jobs
   where id = p_job_id and (p_user_id is null or user_id = p_user_id);
  if not found then return null; end if;
  return jv_job_json(v_job) || jsonb_build_object(
    'provider_status_url', v_job.provider_status_url,
    'provider_cancel_url', v_job.provider_cancel_url,
    'prompt_key', v_job.prompt_key, 'user_id', v_job.user_id);
end $$;

create or replace function jv_jobs_list(
  p_secret text, p_user_id uuid, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_out jsonb;
begin
  perform jv_guard(p_secret);
  -- Aliasing jv_jobs directly keeps `j` a real composite value that
  -- jv_job_json() accepts; a subquery alias would only be an anonymous record.
  select coalesce(jsonb_agg(jv_job_json(j) order by j.created_at desc), '[]'::jsonb)
    into v_out
    from jv_jobs j
   where j.id in (select id from jv_jobs where user_id = p_user_id
                   order by created_at desc limit least(coalesce(p_limit,50), 200));
  return v_out;
end $$;

create or replace function jv_ledger_list(
  p_secret text, p_user_id uuid, p_kind text default null, p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_out jsonb;
begin
  perform jv_guard(p_secret);
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'kind', l.kind, 'amount_credits', l.amount_credits,
           'balance_after', l.balance_after, 'reason', l.reason,
           'job_id', l.job_id, 'created_at', l.created_at)
         order by l.created_at desc), '[]'::jsonb)
    into v_out
    from (select * from jv_ledger
           where user_id = p_user_id
             and (p_kind is null or kind::text = p_kind)
           order by created_at desc limit least(coalesce(p_limit,100), 500)) l;
  return v_out;
end $$;

-- ------------------------------------------------------------ share/stats ---
create or replace function jv_share_enable(p_secret text, p_job_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_job jv_jobs; v_slug text;
begin
  perform jv_guard(p_secret);
  select * into v_job from jv_jobs where id = p_job_id and user_id = p_user_id;
  if not found then raise exception 'job_not_found'; end if;
  if v_job.status <> 'completed' then raise exception 'job_not_completed'; end if;
  v_slug := coalesce(v_job.share_slug, encode(gen_random_bytes(6), 'hex'));
  update jv_jobs set share_slug = v_slug, is_public = true, updated_at = now()
   where id = p_job_id returning * into v_job;
  insert into jv_events (user_id, name) values (p_user_id, 'share');
  return jv_job_json(v_job);
end $$;

-- Public on purpose: renders a share page. Returns only shareable fields and
-- never the owner's identity.
create or replace function jv_share_get(p_slug text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_job jv_jobs;
begin
  select * into v_job from jv_jobs
   where share_slug = p_slug and is_public = true and status = 'completed';
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v_job.id, 'kind', v_job.kind, 'task', v_job.task, 'tier', v_job.tier,
    'model_id', v_job.model_id, 'prompt', v_job.prompt,
    'output_url', coalesce(v_job.stored_url, v_job.output_url),
    'poster_url', v_job.poster_url, 'created_at', v_job.created_at,
    'share_slug', v_job.share_slug);
end $$;

-- Public on purpose: this is the proof surface at /stats.
create or replace function jv_stats()
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'users',              (select count(*) from jv_users),
    'generations',        (select count(*) from jv_jobs),
    'completed',          (select count(*) from jv_jobs where status = 'completed'),
    'credits_refunded',   (select coalesce(sum(amount_credits),0)::int from jv_ledger where kind='refund'),
    'refunded_jobs',      (select count(*) from jv_jobs where refunded),
    'refunds_by_reason',  (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                             from (select status::text as status, count(*) as n from jv_jobs
                                    where refunded group by status) s),
    'credits_expired',    0,
    'shares',             (select count(*) from jv_jobs where is_public),
    'generated_at',       now()
  );
$$;

-- ------------------------------------------------------- ops / housekeeping ---
create or replace function jv_rate_limit(
  p_secret text, p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_count integer;
begin
  perform jv_guard(p_secret);
  insert into jv_rate_limits (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case when jv_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                     then 1 else jv_rate_limits.count + 1 end,
        window_start = case when jv_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
                     then now() else jv_rate_limits.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end $$;

create or replace function jv_jobs_pending(
  p_secret text, p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_out jsonb;
begin
  perform jv_guard(p_secret);
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', j.id, 'user_id', j.user_id, 'status', j.status,
           'provider_status_url', j.provider_status_url,
           'provider_request_id', j.provider_request_id,
           'kind', j.kind, 'prompt_key', j.prompt_key,
           'submitted_at', j.submitted_at, 'created_at', j.created_at)), '[]'::jsonb)
    into v_out
    from (select * from jv_jobs
           where status in ('queued','in_progress')
           order by created_at asc limit least(coalesce(p_limit,25), 100)) j;
  return v_out;
end $$;

create or replace function jv_payout_request(
  p_secret text, p_user_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_balance integer; v_row jv_payout_requests;
begin
  perform jv_guard(p_secret);
  select balance_credits into v_balance from jv_wallets where user_id = p_user_id;
  insert into jv_payout_requests (user_id, credits, email)
  values (p_user_id, coalesce(v_balance,0), lower(p_email))
  returning * into v_row;
  insert into jv_events (user_id, name, props)
  values (p_user_id, 'payout_requested', jsonb_build_object('credits', coalesce(v_balance,0)));
  return jsonb_build_object('id', v_row.id, 'credits', v_row.credits, 'status', v_row.status);
end $$;

create or replace function jv_event(
  p_secret text, p_user_id uuid, p_name text, p_props jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform jv_guard(p_secret);
  insert into jv_events (user_id, name, props) values (p_user_id, p_name, coalesce(p_props,'{}'::jsonb));
end $$;

-- --------------------------------------------------------------- grants ---
-- anon may only call functions; the tables stay RLS-locked with no policies.
revoke all on all tables in schema public from anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
