import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { env } from '@/lib/env';
import { reconcilePending } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Sweeps jobs nobody is polling any more.
 *
 * Without this, closing the tab mid-generation would leave credits in limbo.
 * With it, an abandoned job still reaches a terminal state and still refunds.
 * Netlify runs this every five minutes (see netlify.toml).
 */
async function run(request: Request) {
  const secret = env.cronSecret;
  if (secret) {
    const header = request.headers.get('authorization');
    const query = new URL(request.url).searchParams.get('key');
    if (header !== `Bearer ${secret}` && query !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  const result = await reconcilePending(25);
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  try {
    return await run(request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    return await run(request);
  } catch (error) {
    return errorResponse(error);
  }
}
