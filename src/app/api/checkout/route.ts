import { NextResponse } from 'next/server';
import { ApiError, errorResponse, optionalSession, readJson } from '@/lib/api';
import { env, stripeEnabled } from '@/lib/env';
import { getPack } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

/**
 * Stripe Checkout for credit packs.
 *
 * No subscriptions, no pre-checked upsells, no countdown. One pack, one charge.
 * When STRIPE_SECRET_KEY is absent the route says so plainly rather than
 * pretending a purchase flow exists.
 */
export async function POST(request: Request) {
  try {
    const user = await optionalSession();
    if (!user) throw new ApiError('Start a generation first.', 'no_session', 401);

    const { packId } = await readJson<{ packId?: string }>(request);
    const pack = packId ? getPack(packId) : undefined;
    if (!pack) throw new ApiError('Unknown credit pack.', 'unknown_pack');

    if (!stripeEnabled()) {
      throw new ApiError(
        'Card payments are not switched on yet. Your existing credits still work and still never expire.',
        'payments_disabled',
        503,
      );
    }

    const form = new URLSearchParams({
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(pack.priceCents),
      'line_items[0][price_data][product_data][name]': `${pack.credits} JellyVid credits`,
      'line_items[0][price_data][product_data][description]':
        'Credits never expire. Failed, blocked and duplicate generations refund automatically.',
      success_url: `${env.siteUrl}/wallet?purchase=success`,
      cancel_url: `${env.siteUrl}/pricing?purchase=canceled`,
      client_reference_id: user.id,
      'metadata[user_id]': user.id,
      'metadata[credits]': String(pack.credits),
      'metadata[pack_id]': pack.id,
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });

    if (!response.ok) {
      console.error('[jellyvid] stripe checkout failed', await response.text());
      throw new ApiError('Checkout could not start. You were not charged.', 'stripe_error', 502);
    }

    const session = (await response.json()) as { url?: string; id?: string };
    if (!session.url) throw new ApiError('Checkout could not start.', 'stripe_error', 502);
    return NextResponse.json({ url: session.url, id: session.id });
  } catch (error) {
    return errorResponse(error);
  }
}
