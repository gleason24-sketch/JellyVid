import { NextResponse } from 'next/server';
import { ApiError, errorResponse, readJson } from '@/lib/api';
import { call } from '@/lib/db';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  sha256Hex,
  signSession,
  type AccountUser,
} from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Moves a wallet to this device using the email plus its recovery code. */
export async function POST(request: Request) {
  try {
    const { email, code } = await readJson<{ email?: string; code?: string }>(request);
    if (!email || !code) throw new ApiError('Email and recovery code are both needed.', 'missing_fields');

    const user = await call<AccountUser | null>('jv_user_restore', {
      p_email: email,
      p_recovery_hash: await sha256Hex(code.trim().toUpperCase()),
    });
    if (!user) throw new ApiError('That email and code do not match a wallet.', 'no_match', 404);

    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, await signSession(user.id), sessionCookieOptions());
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
