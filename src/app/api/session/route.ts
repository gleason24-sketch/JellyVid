import { NextResponse } from 'next/server';
import { applySession, ensureSession, errorResponse, optionalSession } from '@/lib/api';
import { SIGNUP_GRANT_CREDITS } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Reads the wallet without minting an account, so a plain visit stays anonymous. */
export async function GET() {
  try {
    const user = await optionalSession();
    return NextResponse.json({ user, signupGrant: SIGNUP_GRANT_CREDITS });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Called the moment someone actually starts: mints the wallet and free credits. */
export async function POST(request: Request) {
  try {
    const session = await ensureSession(request.headers);
    return applySession(
      NextResponse.json({
        user: session.user,
        recoveryCode: session.freshRecoveryCode ?? null,
        signupGrant: SIGNUP_GRANT_CREDITS,
      }),
      session,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
