import { NextResponse } from 'next/server';
import { ApiError, errorResponse, optionalSession } from '@/lib/api';
import { call } from '@/lib/db';
import { advanceJob, getJob } from '@/lib/jobs';
import type { Wallet } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The polling endpoint. Every read also advances the job, so a terminal state
 * at the provider is settled -- and refunded when it should be -- the first
 * time anyone looks.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await optionalSession();
    if (!user) throw new ApiError('No wallet on this device.', 'no_session', 401);

    const { id } = await context.params;
    const job = await getJob(id, user.id);
    if (!job) throw new ApiError('No such generation.', 'not_found', 404);

    const advanced = await advanceJob(job);
    // Re-read the wallet: advanceJob may have just refunded into it.
    const wallet = await call<Wallet>('jv_wallet_get', { p_user_id: user.id });

    return NextResponse.json({ job: advanced, wallet });
  } catch (error) {
    return errorResponse(error);
  }
}
