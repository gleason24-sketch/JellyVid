import type { Metadata } from 'next';
import Studio from '@/components/studio';
import { optionalSession } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Studio',
  description: 'Pick what you are making, describe it, see the price, generate.',
};

export default async function StudioPage() {
  // Read-only: an anonymous visit does not mint a wallet until they generate.
  const user = await optionalSession();
  return <Studio initialWallet={user?.wallet ?? null} />;
}
