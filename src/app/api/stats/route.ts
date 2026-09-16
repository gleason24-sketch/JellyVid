import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { callPublic } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Public counts. This is the proof surface, so it is deliberately unauthenticated. */
export async function GET() {
  try {
    const stats = await callPublic<Record<string, unknown>>('jv_stats');
    return NextResponse.json(stats, {
      headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=60' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
