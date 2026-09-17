import { isMockMode, higgsfieldCredentials } from '@/lib/env';

/**
 * Says out loud when outputs are placeholders.
 *
 * This product's whole argument is that you should be told what you are
 * actually getting. Serving fixture images while implying they came from a
 * frontier model would be exactly the behaviour it exists to oppose, so the
 * banner is not optional and not dismissible.
 */
export default function DemoBanner() {
  if (!isMockMode()) return null;

  const configured = higgsfieldCredentials() !== null;

  return (
    <div className="border-b border-[var(--color-yellow)]/40 bg-[rgba(242,255,92,0.08)] px-4 py-2.5">
      <p className="mx-auto max-w-6xl text-xs leading-relaxed text-[var(--color-yellow)] sm:text-sm">
        <strong className="font-bold">Demo mode.</strong> Generations return
        placeholder images, not real AI output
        {configured
          ? ', because the connected generation account has no API credits yet.'
          : ', because no generation credentials are configured yet.'}{' '}
        <span className="text-[var(--color-muted)]">
          Everything else here is real: wallets, pricing, the automatic refunds
          and the live counts on /stats.
        </span>
      </p>
    </div>
  );
}
