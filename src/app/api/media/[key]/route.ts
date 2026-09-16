import { NextResponse } from 'next/server';
import { readStoredMedia } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

/** Serves the mirrored copy, which outlives the provider's ~7-day retention. */
export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  const object = await readStoredMedia(key);
  if (!object) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(object.bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': object.contentType,
      'Content-Length': String(object.bytes.byteLength),
      // Content at a given key never changes, so this can be cached hard.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
