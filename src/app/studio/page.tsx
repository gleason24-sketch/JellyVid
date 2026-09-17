import type { Metadata } from 'next';
import Studio from '@/components/studio';
import { optionalSession } from '@/lib/api';
import { TASKS, type TaskId } from '@/lib/models';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Studio',
  description: 'Pick what you are making, describe it, see the price, generate.',
};

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  // Read-only: an anonymous visit does not mint a wallet until they generate.
  const user = await optionalSession();
  const { task } = await searchParams;
  const initialTask = task && task in TASKS ? (task as TaskId) : undefined;
  return <Studio initialWallet={user?.wallet ?? null} initialTask={initialTask} />;
}
