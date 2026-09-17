/**
 * Money invariants, asserted against the real database.
 *
 * These are the guarantees that cannot be tested at the TypeScript layer,
 * because the whole point is that they hold even if the app misbehaves:
 * a wallet cannot go negative, a refund cannot be applied twice, and the
 * publishable key cannot read a single row on its own.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { call, callPublic } from '@/lib/db';
import { env } from '@/lib/env';

interface Wallet {
  balance_credits: number;
  lifetime_refunded: number;
  never_expires: true;
  expires_at: null;
}
interface Account {
  id: string;
  wallet: Wallet;
}
interface Job {
  id: string;
  status: string;
  refunded: boolean;
  cost_credits: number;
}

const configured = Boolean(process.env.SUPABASE_URL && process.env.JELLYVID_DB_SECRET);
const maybe = configured ? describe : describe.skip;

async function newAccount(grant: number): Promise<Account> {
  return call<Account>('jv_bootstrap', {
    p_ip_hash: `test-${crypto.randomUUID()}`,
    p_grant: grant,
    p_recovery_hash: null,
  });
}

function spend(userId: string, cost: number, promptLabel: string) {
  return call<{ job: Job; wallet: Wallet }>('jv_job_create', {
    p_user_id: userId,
    p_task: 'cinematic_shot',
    p_tier: 'draft',
    p_kind: 'video',
    p_model_id: 'seedance-2-draft',
    p_endpoint: '/bytedance/seedance-2.0/text-to-video',
    p_prompt: promptLabel,
    p_prompt_key: `cinematic_shot:${promptLabel}`,
    p_params: {},
    p_input_url: null,
    p_cost: cost,
    p_consent_at: null,
    p_parent_job_id: null,
  });
}

maybe('wallet invariants', () => {
  beforeAll(() => {
    expect(env.supabaseUrl).toMatch(/^https:\/\//);
  });

  it('grants the signup credits and reports that they never expire', async () => {
    const account = await newAccount(200);
    expect(account.wallet.balance_credits).toBe(200);
    expect(account.wallet.never_expires).toBe(true);
    expect(account.wallet.expires_at).toBeNull();
  });

  it('refuses a spend larger than the balance without moving a credit', async () => {
    const account = await newAccount(30);
    await expect(spend(account.id, 40, 'too expensive')).rejects.toMatchObject({
      code: 'insufficient_credits',
    });
    const wallet = await call<Wallet>('jv_wallet_get', { p_user_id: account.id });
    expect(wallet.balance_credits).toBe(30);
  });

  it('cannot be double-spent by concurrent requests', async () => {
    const account = await newAccount(100);
    // Five simultaneous 40-credit jobs against a 100-credit wallet: exactly
    // two can succeed, and the balance must never go negative.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) => spend(account.id, 40, `race ${index}`)),
    );
    const accepted = results.filter((result) => result.status === 'fulfilled');
    expect(accepted).toHaveLength(2);

    const wallet = await call<Wallet>('jv_wallet_get', { p_user_id: account.id });
    expect(wallet.balance_credits).toBe(20);
    expect(wallet.balance_credits).toBeGreaterThanOrEqual(0);
  });

  it('refunds a failed job automatically and exactly once', async () => {
    const account = await newAccount(100);
    const { job } = await spend(account.id, 40, 'will fail');

    const first = await call<Job>('jv_job_finalize', {
      p_job_id: job.id,
      p_status: 'failed',
      p_error_reason: 'forced',
    });
    expect(first.refunded).toBe(true);

    // Finalising again must be a no-op, not a second refund.
    const second = await call<Job>('jv_job_finalize', { p_job_id: job.id, p_status: 'failed' });
    expect(second.refunded).toBe(true);

    const wallet = await call<Wallet>('jv_wallet_get', { p_user_id: account.id });
    expect(wallet.balance_credits).toBe(100);
    expect(wallet.lifetime_refunded).toBe(40);

    const refunds = await call<unknown[]>('jv_ledger_list', {
      p_user_id: account.id,
      p_kind: 'refund',
      p_limit: 50,
    });
    expect(refunds).toHaveLength(1);
  });

  it('charges nothing for a moderation block', async () => {
    const account = await newAccount(100);
    const { job } = await spend(account.id, 40, 'will be blocked');
    const settled = await call<Job>('jv_job_finalize', { p_job_id: job.id, p_status: 'nsfw' });

    expect(settled.status).toBe('nsfw');
    expect(settled.refunded).toBe(true);
    const wallet = await call<Wallet>('jv_wallet_get', { p_user_id: account.id });
    expect(wallet.balance_credits).toBe(100); // net zero: blocked costs nothing
  });

  it('will not overwrite a job that has already reached a terminal state', async () => {
    const account = await newAccount(100);
    const { job } = await spend(account.id, 40, 'settles once');
    await call<Job>('jv_job_finalize', { p_job_id: job.id, p_status: 'completed' });

    const attempted = await call<Job>('jv_job_finalize', { p_job_id: job.id, p_status: 'failed' });
    expect(attempted.status).toBe('completed');
    expect(attempted.refunded).toBe(false);
  });

  it('credits a purchase only once per payment reference', async () => {
    const account = await newAccount(0);
    const reference = `test:${crypto.randomUUID()}`;
    await call<Wallet>('jv_credit', {
      p_user_id: account.id,
      p_kind: 'purchase',
      p_amount: 500,
      p_reason: 'test pack',
      p_external_ref: reference,
    });
    // A replayed webhook delivers the same reference.
    const replayed = await call<Wallet>('jv_credit', {
      p_user_id: account.id,
      p_kind: 'purchase',
      p_amount: 500,
      p_reason: 'test pack',
      p_external_ref: reference,
    });
    expect(replayed.balance_credits).toBe(500);
  });
});

maybe('access control', () => {
  it('rejects a wrong app secret', async () => {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/jv_jobs_pending`, {
      method: 'POST',
      headers: {
        apikey: env.supabaseAnonKey,
        Authorization: `Bearer ${env.supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_secret: 'not-the-secret', p_limit: 5 }),
    });
    expect(response.ok).toBe(false);
    expect(await response.text()).toMatch(/unauthorized/);
  });

  it('lets the publishable key read no table directly, because RLS denies it', async () => {
    for (const table of ['jv_users', 'jv_wallets', 'jv_ledger', 'jv_jobs', 'jv_config']) {
      const response = await fetch(`${env.supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
          apikey: env.supabaseAnonKey,
          Authorization: `Bearer ${env.supabaseAnonKey}`,
        },
      });
      const body = await response.text();
      // Either refused outright, or allowed through to an empty set by RLS.
      // What must never happen is a row coming back.
      expect(body.trim(), `${table} leaked rows to the anon key`).toMatch(/^(\[\]|\{.*(message|code).*\})$/s);
      expect(body).not.toMatch(/balance_credits"\s*:\s*\d/);
    }
  });

  it('serves public stats without any secret at all', async () => {
    const stats = await callPublic<{ users: number; credits_expired: number }>('jv_stats');
    expect(typeof stats.users).toBe('number');
    // Structurally zero: nothing in the schema can expire a credit.
    expect(stats.credits_expired).toBe(0);
  });
});
