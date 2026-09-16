/**
 * Shared plumbing for route handlers: session bootstrap, uniform error shapes,
 * and rate limiting.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DbError, call } from './db';
import { HiggsfieldError } from './higgsfield';
import { JobError } from './jobs';
import {
  SESSION_COOKIE,
  type AccountUser,
  clientIp,
  createAccount,
  generateRecoveryCode,
  hashIp,
  readSignedSession,
  sessionCookieOptions,
  signSession,
} from './session';

export interface SessionContext {
  user: AccountUser;
  /** Present only on the request that created the account. */
  freshRecoveryCode?: string;
  /** Set by the caller onto the response when a new account was minted. */
  cookieValue?: string;
}

/**
 * Returns the caller's account, creating one on first contact.
 *
 * This is the 60-second activation rule in code: no email, no password, no
 * confirmation step between landing and generating.
 */
export async function ensureSession(headers: Headers): Promise<SessionContext> {
  const store = await cookies();
  const existingId = await readSignedSession(store.get(SESSION_COOKIE)?.value);

  if (existingId) {
    const user = await call<AccountUser | null>('jv_user_get', { p_user_id: existingId });
    if (user) return { user };
  }

  const ip = clientIp(headers);
  const ipHash = await hashIp(ip);

  // Free credits are abusable, so new accounts are capped per IP per day.
  if (ipHash) {
    const allowed = await call<boolean>('jv_rate_limit', {
      p_key: `signup:${ipHash}`,
      p_limit: Number(process.env.JELLYVID_SIGNUPS_PER_IP_PER_DAY ?? '5'),
      p_window_seconds: 86_400,
    });
    if (!allowed) {
      throw new ApiError(
        'Too many new accounts from this connection today.',
        'signup_rate_limited',
        429,
      );
    }
  }

  const recoveryCode = generateRecoveryCode();
  const user = await createAccount(ipHash, recoveryCode);
  return { user, freshRecoveryCode: recoveryCode, cookieValue: await signSession(user.id) };
}

/** Reads the session without creating one. Used by pages that just display state. */
export async function optionalSession(): Promise<AccountUser | null> {
  const store = await cookies();
  const userId = await readSignedSession(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return call<AccountUser | null>('jv_user_get', { p_user_id: userId });
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function applySession(response: NextResponse, session: SessionContext): NextResponse {
  if (session.cookieValue) {
    response.cookies.set(SESSION_COOKIE, session.cookieValue, sessionCookieOptions());
  }
  return response;
}

/**
 * Turns any thrown value into a response the UI can render honestly. Every
 * message here is written for a person, and says explicitly whether money moved.
 */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof JobError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof HiggsfieldError) {
    return NextResponse.json(
      { error: error.userMessage, code: error.code },
      { status: error.code === 'rate_limited' ? 429 : 502 },
    );
  }
  if (error instanceof DbError) {
    if (error.code === 'insufficient_credits') {
      return NextResponse.json(
        {
          error: 'Not enough credits for this one. Nothing was charged.',
          code: 'insufficient_credits',
        },
        { status: 402 },
      );
    }
    if (error.code === 'email_taken') {
      return NextResponse.json(
        { error: 'That email is already on another wallet.', code: 'email_taken' },
        { status: 409 },
      );
    }
    console.error('[jellyvid] db error', error.code, error.message);
    return NextResponse.json(
      { error: 'Our database did not answer. Nothing was charged.', code: 'db_error' },
      { status: 503 },
    );
  }

  console.error('[jellyvid] unhandled error', error);
  return NextResponse.json(
    { error: 'Something went wrong on our side. Nothing was charged.', code: 'internal_error' },
    { status: 500 },
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError('Malformed request body.', 'bad_json', 400);
  }
}

/** Per-user throttle so one tab cannot flood the provider. */
export async function throttle(key: string, limit: number, windowSeconds: number): Promise<void> {
  const allowed = await call<boolean>('jv_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (!allowed) {
    throw new ApiError(
      'You are going faster than we can generate. Give it a few seconds.',
      'rate_limited',
      429,
    );
  }
}
