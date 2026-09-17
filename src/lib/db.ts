/**
 * Thin PostgREST RPC client.
 *
 * The app deliberately holds no Supabase service-role key. Every table is
 * RLS-locked with no policies, so the publishable anon key can read nothing on
 * its own; the SECURITY DEFINER functions it calls each demand JELLYVID_DB_SECRET,
 * which lives only in server environment variables. See supabase/migrations.
 */
import 'server-only';
import { env } from './env';

export class DbError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DbError';
  }
}

type Json = Record<string, unknown>;

async function rpc<T>(fn: string, args: Json, opts: { withSecret?: boolean } = {}): Promise<T> {
  const body = opts.withSecret === false ? args : { p_secret: env.dbSecret, ...args };
  const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${env.supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const text = await response.text();
  if (!response.ok) {
    let code = 'db_error';
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; hint?: string };
      message = parsed.message ?? text;
      // Our functions raise bare machine-readable codes: insufficient_credits, etc.
      if (parsed.message && /^[a-z_]+$/.test(parsed.message)) code = parsed.message;
    } catch {
      /* keep the raw body as the message */
    }
    throw new DbError(message, code, response.status);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Calls a function that takes the app secret (everything that touches user data). */
export function call<T>(fn: string, args: Json = {}): Promise<T> {
  return rpc<T>(fn, args);
}

/** Calls one of the two deliberately public functions: jv_share_get, jv_stats. */
export function callPublic<T>(fn: string, args: Json = {}): Promise<T> {
  return rpc<T>(fn, args, { withSecret: false });
}
