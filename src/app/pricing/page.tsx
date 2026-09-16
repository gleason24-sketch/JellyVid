import type { Metadata } from 'next';
import PricingView from '@/components/pricing-view';
import { stripeEnabled } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'One flat rate. 1 credit = 1 cent, in every pack. No subscriptions, ever.',
};

export default function PricingPage() {
  return <PricingView paymentsEnabled={stripeEnabled()} />;
}
