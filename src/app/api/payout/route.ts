import { NextResponse } from 'next/server';
import { ApiError, errorResponse, optionalSession, readJson } from '@/lib/api';
import { call } from '@/lib/db';
import { env } from '@/lib/env';
import { creditsToUsd } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

/**
 * Cash out an unused balance. Complaint #9 is that leaving is hard, so this is
 * one button: it files the request and hands back a prefilled support email.
 */
export async function POST(request: Request) {
  try {
    const user = await optionalSession();
    if (!user) throw new ApiError('No wallet on this device.', 'no_session', 401);
    if (user.wallet.balance_credits <= 0) {
      throw new ApiError('There is nothing left to refund.', 'empty_wallet');
    }

    const { email } = await readJson<{ email?: string }>(request);
    const contact = email ?? user.email;
    if (!contact) throw new ApiError('Tell us where to reach you.', 'email_required');

    const result = await call<{ id: string; credits: number }>('jv_payout_request', {
      p_user_id: user.id,
      p_email: contact,
    });

    const subject = `Refund my JellyVid balance (${result.credits} credits)`;
    const body = [
      `Wallet: ${user.id}`,
      `Request: ${result.id}`,
      `Balance: ${result.credits} credits (${creditsToUsd(result.credits)})`,
      '',
      'Please refund my unused balance to the original payment method.',
    ].join('\n');

    return NextResponse.json({
      request: result,
      mailto: `mailto:${env.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
