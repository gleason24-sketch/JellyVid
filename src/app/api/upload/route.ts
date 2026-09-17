import { NextResponse } from 'next/server';
import { ApiError, applySession, ensureSession, errorResponse, throttle } from '@/lib/api';
import { createUploadTarget, uploadToTarget } from '@/lib/higgsfield';
import { isMockMode } from '@/lib/env';
import { putObject } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Proxies the upload so the browser never sees a Higgsfield credential. The
 * file goes to the provider's presigned URL, which gets no credential either.
 */
export async function POST(request: Request) {
  try {
    const session = await ensureSession(request.headers);
    await throttle(`upload:${session.user.id}`, 20, 300);

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError('No file received.', 'no_file');
    if (!ALLOWED.includes(file.type)) {
      throw new ApiError('Use a JPEG, PNG, WebP or GIF.', 'bad_type');
    }
    if (file.size > MAX_BYTES) throw new ApiError('That image is over 12 MB.', 'too_large');

    const bytes = await file.arrayBuffer();

    if (isMockMode()) {
      // Mock mode keeps the file local so tests never touch the provider.
      const key = `upload-${crypto.randomUUID()}.${file.type.split('/')[1]}`;
      await putObject(key, new Uint8Array(bytes), file.type);
      return applySession(NextResponse.json({ url: `/api/media/${key}` }), session);
    }

    const target = await createUploadTarget(file.type === 'image/jpg' ? 'image/jpeg' : file.type);
    const publicUrl = await uploadToTarget(target, bytes);
    return applySession(NextResponse.json({ url: publicUrl }), session);
  } catch (error) {
    return errorResponse(error);
  }
}
