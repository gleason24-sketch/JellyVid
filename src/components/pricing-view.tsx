'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CREDIT_PACKS, creditsToUsd } from '@/lib/pricing';
import { MODELS } from '@/lib/models';

export default function PricingView({ paymentsEnabled }: { paymentsEnabled: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function buy(packId: string) {
    setBusy(packId);
    setNotice(null);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (response.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setNotice(data.error ?? 'Checkout is unavailable right now.');
    } catch {
      setNotice('Checkout is unavailable right now. You were not charged.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-10">
      <h1 className="jv-display text-[clamp(2rem,9vw,3.5rem)]">
        One rate. Every pack. <span className="text-[var(--color-pink)]">Forever.</span>
      </h1>
      <p className="mt-3 max-w-2xl text-[var(--color-muted)]">
        1 credit costs 1 cent, in every pack, with no volume discount and no subscription. A larger
        pack gets you more credits, never cheaper ones — so there is no optimal moment to buy and
        nothing to feel clever or foolish about.
      </p>

      {!paymentsEnabled ? (
        <div className="jv-panel mt-6 border-[var(--color-yellow)] p-4">
          <p className="text-sm font-bold text-[var(--color-yellow)]">
            Card payments are not switched on yet.
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Your free credits work now and never expire. We would rather say this plainly than show
            you a buy button that fails at the last step.
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CREDIT_PACKS.map((pack) => (
          <div key={pack.id} className="jv-panel flex flex-col p-5">
            <p className="text-3xl font-extrabold tabular-nums">{pack.credits.toLocaleString()}</p>
            <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">credits</p>
            <p className="mt-4 text-2xl font-bold text-[var(--color-pink)]">
              ${(pack.priceCents / 100).toFixed(0)}
            </p>
            <p className="mt-1 text-xs text-[var(--color-faint)]">{pack.yardstick}</p>
            <p className="mt-3 text-xs font-semibold text-[var(--color-blue)]">Never expires</p>
            <button
              type="button"
              onClick={() => void buy(pack.id)}
              disabled={busy !== null}
              className="jv-btn jv-btn-primary mt-auto pt-3 !min-h-11 !text-sm"
              style={{ marginTop: '1.25rem' }}
            >
              {busy === pack.id ? 'Opening…' : `Buy ${pack.credits} credits`}
            </button>
          </div>
        ))}
      </div>

      {notice ? (
        <p role="status" className="mt-4 text-sm text-[var(--color-yellow)]">
          {notice}
        </p>
      ) : null}

      <h2 className="jv-display mt-14 text-[clamp(1.5rem,6vw,2.25rem)]">What a generation costs</h2>
      <div className="jv-panel mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="border-b border-[var(--color-line)] text-xs uppercase tracking-wider text-[var(--color-muted)]">
            <tr>
              <th scope="col" className="p-3">Model</th>
              <th scope="col" className="p-3">Tier</th>
              <th scope="col" className="p-3 text-right">Credits</th>
              <th scope="col" className="p-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]">
            {Object.values(MODELS).map((model) => (
              <tr key={model.id}>
                <th scope="row" className="p-3 text-left font-semibold">{model.label}</th>
                <td className="p-3 capitalize text-[var(--color-muted)]">{model.tier}</td>
                <td className="p-3 text-right font-bold tabular-nums">{model.credits}</td>
                <td className="p-3 text-right tabular-nums text-[var(--color-muted)]">
                  {creditsToUsd(model.credits)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        This exact number appears on the Generate button before you press it. If it ever disagrees
        with the button, the job is refused rather than charged.
      </p>

      <h2 className="jv-display mt-14 text-[clamp(1.5rem,6vw,2.25rem)]">What we do not do</h2>
      <ul className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
        {[
          'No subscriptions, so there is no renewal date to lose credits at.',
          'No annual plan pre-selected for you, because there is no annual plan.',
          'No countdown timers or fake scarcity.',
          'No pre-checked boxes anywhere in this product.',
          'No charge for a generation that failed, was blocked, or came back a duplicate.',
        ].map((line) => (
          <li key={line} className="flex gap-3">
            <span aria-hidden className="text-[var(--color-pink)]">✕</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link href="/studio" className="jv-btn jv-btn-primary">
          Start with free credits
        </Link>
        <Link href="/promises" className="jv-btn jv-btn-ghost">
          Read the promises
        </Link>
      </div>
    </div>
  );
}
