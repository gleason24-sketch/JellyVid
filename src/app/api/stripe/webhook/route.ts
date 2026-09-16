import { NextResponse } from 'next/server';
import { call } from '@/lib/db';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Constant-time compare so a signature check cannot be timed open. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verify(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((piece) => piece.split('=') as [string, string]),
  );
  if (!parts.t || !parts.v1) return false;
  // Reject replays of an old, valid signature.
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  return timingSafeEqual(await hmacHex(`${parts.t}.${rawBody}`, secret), parts.v1);
}

/** Credits the wallet once a payment actually completes. */
export async function POST(request: Request) {
  const secret = env.stripeWebhookSecret;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const rawBody = await request.text();
  if (!(await verify(rawBody, request.headers.get('stripe-signature'), secret))) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as {
    id: string;
    type: string;
    data: { object: { id?: string; metadata?: Record<string, string> } };
  };

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  const userId = session.metadata?.user_id;
  const credits = Number(session.metadata?.credits ?? '0');
  if (!userId || !Number.isFinite(credits) || credits <= 0) {
    return NextResponse.json({ received: true, ignored: 'missing_metadata' });
  }

  try {
    // external_ref is unique in the ledger, so a redelivered webhook is a no-op.
    await call('jv_credit', {
      p_user_id: userId,
      p_kind: 'purchase',
      p_amount: credits,
      p_reason: `Credit pack purchase — ${credits} credits. These never expire.`,
      p_external_ref: `stripe:${session.id ?? event.id}`,
    });
    return NextResponse.json({ received: true, credited: credits });
  } catch (error) {
    console.error('[jellyvid] stripe credit failed', error);
    // A non-2xx makes Stripe retry, which the idempotency key makes safe.
    return NextResponse.json({ error: 'credit_failed' }, { status: 500 });
  }
}
