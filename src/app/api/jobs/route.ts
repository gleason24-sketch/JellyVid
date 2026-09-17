import { NextResponse } from 'next/server';
import { errorResponse, optionalSession } from '@/lib/api';
import { listJobs } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await optionalSession();
    if (!user) return NextResponse.json({ jobs: [] });
    return NextResponse.json({ jobs: await listJobs(user.id, 60), wallet: user.wallet });
  } catch (error) {
    return errorResponse(error);
  }
}
