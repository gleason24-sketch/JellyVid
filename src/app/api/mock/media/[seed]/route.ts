import { NextResponse } from 'next/server';
import { isMockMode } from '@/lib/env';
import { renderMockPng } from '@/lib/mock-image';

export const dynamic = 'force-dynamic';

/** Fixture media for HF_MOCK=1. Refuses to serve when mock mode is off. */
export async function GET(_request: Request, context: { params: Promise<{ seed: string }> }) {
  if (!isMockMode()) return new NextResponse('Not found', { status: 404 });

  const { seed } = await context.params;
  const parsed = Number(seed.replace(/\.png$/, ''));
  if (!Number.isFinite(parsed)) return new NextResponse('Bad seed', { status: 400 });

  const png = renderMockPng(parsed);
  return new NextResponse(png as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
