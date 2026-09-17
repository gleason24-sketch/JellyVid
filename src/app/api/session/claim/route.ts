import { NextResponse } from 'next/server';
import { ApiError, errorResponse, optionalSession, readJson } from '@/lib/api';
import { call } from '@/lib/db';
import { generateRecoveryCode, sha256Hex, type AccountUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Attaches an email to an anonymous wallet so it can be moved between devices.
 * Optional by design: nothing about generating requires it.
 */
export async function POST(request: Request) {
  try {
    const user = await optionalSession();
    if (!user) throw new ApiError('Start a generation first.', 'no_session', 401);

    const { email } = await readJson<{ email?: string }>(request);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
      throw new ApiError('That does not look like an email address.', 'bad_email');
    }

    // A fresh code is issued on claim so the pair (email, code) is the key.
    const recoveryCode = generateRecoveryCode();
    const updated = await call<AccountUser>('jv_user_claim', {
      p_user_id: user.id,
      p_email: email,
      p_recovery_hash: await sha256Hex(recoveryCode),
    });

    return NextResponse.json({ user: updated, recoveryCode });
  } catch (error) {
    return errorResponse(error);
  }
}
