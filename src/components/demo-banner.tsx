import { isMockMode, higgsfieldCredentials } from '@/lib/env';

/**
 * Says out loud when outputs are placeholders.
 *
 * This product's whole argument is that you should be told what you are
 * actually getting, so the notice is not dismissible. It is one line, because
 * a five-line disclaimer above the fold is its own kind of dishonesty — it
 * buries the thing people came for.
 */
export default function DemoBanner() {
  if (!isMockMode()) return null;

  const configured = higgsfieldCredentials() !== null;

  return (
    <div className="border-b border-[var(--color-line-soft)] bg-[var(--color-surface)]">
      <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-[12px] leading-tight text-[var(--color-muted)]">
        <span className="shrink-0 rounded bg-[var(--color-yellow)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-black">
          Demo
        </span>
        <span className="min-w-0">
          Outputs are placeholders
          {configured ? ' until generation credits are loaded' : ' until credentials are set'}.
          Wallets, refunds and stats are real.
        </span>
      </p>
    </div>
  );
}
