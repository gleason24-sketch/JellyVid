import type { Metadata } from 'next';
import Link from 'next/link';
import { callPublic } from '@/lib/db';
import { creditsToUsd } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stats',
  description: 'Live counts straight from the database: people, generations, and credits we refunded on our own.',
};

interface Stats {
  users: number;
  generations: number;
  completed: number;
  credits_refunded: number;
  refunded_jobs: number;
  refunds_by_reason: Record<string, number>;
  credits_expired: number;
  shares: number;
  generated_at: string;
}

const REASON_LABELS: Record<string, string> = {
  failed: 'Generation failed',
  nsfw: 'Moderation block',
  duplicate: 'Duplicate output',
  timeout: 'Timed out',
  canceled: 'Canceled',
};

export default async function StatsPage() {
  let stats: Stats | null = null;
  try {
    stats = await callPublic<Stats>('jv_stats');
  } catch {
    stats = null;
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-extrabold">Stats are briefly unavailable</h1>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          The database did not answer. Rather than show you a made-up number, we are showing you
          nothing.
        </p>
      </div>
    );
  }

  const tiles = [
    { label: 'Wallets created', value: stats.users, tone: 'pink' },
    { label: 'Generations run', value: stats.generations, tone: 'blue' },
    { label: 'Delivered', value: stats.completed, tone: 'blue' },
    { label: 'Credits auto-refunded', value: stats.credits_refunded, tone: 'yellow' },
    { label: 'Jobs refunded without being asked', value: stats.refunded_jobs, tone: 'yellow' },
    { label: 'Credits expired', value: stats.credits_expired, tone: 'pink' },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-10">
      <h1 className="jv-display text-[clamp(2rem,9vw,3.5rem)]">Live from the database</h1>
      <p className="mt-3 max-w-2xl text-[var(--color-muted)]">
        Not a marketing page. These are counts read from the production tables when you loaded
        this, including the one number most studios would never publish: how much money we handed
        back without being asked.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="jv-panel p-4">
            <p
              className="text-3xl font-extrabold tabular-nums"
              style={{ color: `var(--color-${tile.tone})` }}
            >
              {tile.value.toLocaleString()}
            </p>
            <p className="mt-1 text-xs leading-snug text-[var(--color-muted)]">{tile.label}</p>
          </div>
        ))}
      </div>

      <div className="jv-panel mt-4 p-5">
        <p className="text-sm text-[var(--color-muted)]">
          That is{' '}
          <strong className="text-[var(--color-text)]">
            {creditsToUsd(stats.credits_refunded)}
          </strong>{' '}
          of generation credit returned automatically, and{' '}
          <strong className="text-[var(--color-text)]">{stats.credits_expired}</strong> credits lost
          to expiry — a number that is structurally zero, because the schema has nowhere to record
          an expiry date.
        </p>
      </div>

      {Object.keys(stats.refunds_by_reason).length > 0 ? (
        <>
          <h2 className="jv-display mt-10 text-xl">Why we refunded</h2>
          <div className="jv-panel mt-3 divide-y divide-[var(--color-line)]">
            {Object.entries(stats.refunds_by_reason).map(([reason, count]) => (
              <div key={reason} className="flex items-center justify-between p-4">
                <span className="text-sm">{REASON_LABELS[reason] ?? reason}</span>
                <span className="font-bold tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <p className="mt-8 text-xs text-[var(--color-faint)]">
        Read at {new Date(stats.generated_at).toUTCString()}. {stats.shares.toLocaleString()} outputs
        have been shared publicly.
      </p>

      <div className="mt-8">
        <Link href="/studio" className="jv-btn jv-btn-primary">
          Add to these numbers
        </Link>
      </div>
    </div>
  );
}
