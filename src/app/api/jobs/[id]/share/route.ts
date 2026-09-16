import { NextResponse } from 'next/server';
import { ApiError, errorResponse, optionalSession } from '@/lib/api';
import { call } from '@/lib/db';
import type { Job } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await optionalSession();
    if (!user) throw new ApiError('No wallet on this device.', 'no_session', 401);
    const { id } = await context.params;
    const job = await call<Job>('jv_share_enable', { p_job_id: id, p_user_id: user.id });
    return NextResponse.json({ job, url: `/s/${job.share_slug}` });
  } catch (error) {
    return errorResponse(error);
  }
}
