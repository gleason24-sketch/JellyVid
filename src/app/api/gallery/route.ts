import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { callPublic } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Public feed of what people chose to publish. No secret, no identities. */
export async function GET(request: Request) {
  try {
    const limit = Number(new URL(request.url).searchParams.get('limit') ?? '24');
    const items = await callPublic<unknown[]>('jv_gallery', { p_limit: limit });
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=120' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
