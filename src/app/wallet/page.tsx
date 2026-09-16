import type { Metadata } from 'next';
import WalletView from '@/components/wallet-view';
import { optionalSession } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Wallet',
  description: 'Your balance, every credit movement, and the refunds that happened on their own.',
};

export default async function WalletPage() {
  const user = await optionalSession();
  return <WalletView initialWallet={user?.wallet ?? null} initialEmail={user?.email ?? null} />;
}
