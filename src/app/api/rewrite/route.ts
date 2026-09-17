import { NextResponse } from 'next/server';
import { ApiError, errorResponse, readJson } from '@/lib/api';
import { rewriteSafely } from '@/lib/moderation';

export const dynamic = 'force-dynamic';

/**
 * "Rewrite safely". Runs locally and costs nothing, so a moderation block has a
 * one-click way forward instead of a dead end.
 */
export async function POST(request: Request) {
  try {
    const { prompt } = await readJson<{ prompt?: string }>(request);
    if (!prompt || prompt.trim().length < 3) {
      throw new ApiError('Nothing to rewrite.', 'prompt_too_short');
    }
    return NextResponse.json(rewriteSafely(prompt.trim()));
  } catch (error) {
    return errorResponse(error);
  }
}
