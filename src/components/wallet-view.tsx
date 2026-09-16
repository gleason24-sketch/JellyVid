'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { creditsToUsd } from '@/lib/pricing';
import { Badge, BalanceDisplay } from './ui';

interface Wallet {
  balance_credits: number;
  lifetime_granted: number;
  lifetime_purchased: number;
  lifetime_spent: number;
  lifetime_refunded: number;
}

interface Entry {
  id: string;
  kind: 'grant' | 'purchase' | 'spend' | 'refund' | 'adjustment' | 'payout';
  amount_credits: number;
  balance_after: number;
  reason: string;
  created_at: string;
}

const TABS = [
  { id: 'all', label: 'Everything' },
  { id: 'refund', label: 'Refunds' },
  { id: 'spend', label: 'Spends' },
  { id: 'purchase', label: 'Top-ups' },
] as const;

export default function WalletView({
  initialWallet,
  initialEmail,
}: {
  initialWallet: Wallet | null;
  initialEmail: string | null;
}) {
  const [wallet, setWallet] = useState(initialWallet);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('all');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(initialEmail ?? '');
  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payoutLink, setPayoutLink] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetch(`/api/ledger?kind=${tab}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((data: { entries?: Entry[]; wallet?: Wallet }) => {
        if (!active) return;
        setEntries(data.entries ?? []);
        if (data.wallet) setWallet(data.wallet);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tab]);

  async function claim() {
    setNotice(null);
    const response = await fetch('/api/session/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as { recoveryCode?: string; error?: string };
    if (!response.ok) {
      setNotice(data.error ?? 'Could not save that.');
      return;
    }
    setClaimCode(data.recoveryCode ?? null);
    setNotice('Saved. Write the code down — it is how you move this wallet.');
  }

  async function requestPayout() {
    setNotice(null);
    const response = await fetch('/api/payout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as { mailto?: string; error?: string };
    if (!response.ok) {
      setNotice(data.error ?? 'Could not file that request.');
      return;
    }
    setPayoutLink(data.mailto ?? null);
    setNotice('Request filed. The button below opens a prefilled email to support.');
  }

  if (!wallet) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">No wallet on this device yet</h1>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          One is created — with free credits — the first time you generate something.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/studio" className="jv-btn jv-btn-primary">
            Open the studio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-8">
      <div className="jv-card mb-6 p-5 sm:p-6">
        <BalanceDisplay credits={wallet.balance_credits} size="lg" />
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {creditsToUsd(wallet.balance_credits)} of generation. No expiry date, because there is no
          expiry date to have.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ['Granted', wallet.lifetime_granted],
            ['Bought', wallet.lifetime_purchased],
            ['Spent', wallet.lifetime_spent],
            ['Auto-refunded', wallet.lifetime_refunded],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</dt>
              <dd className="text-lg font-bold tabular-nums">{(value as number).toLocaleString()}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/pricing" className="jv-btn jv-btn-primary !min-h-11 !px-5 !text-sm">
            Add credits
          </Link>
          <Link href="/studio" className="jv-btn jv-btn-ghost !min-h-11 !px-5 !text-sm">
            Back to studio
          </Link>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Ledger filter"
        className="mb-4 flex gap-2 overflow-x-auto pb-1"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
              tab === item.id
                ? 'border-[var(--color-pink)] bg-[rgba(255,43,214,0.12)] text-[var(--color-text)]'
                : 'border-[var(--color-line)] text-[var(--color-muted)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="jv-card divide-y divide-[var(--color-line)]">
        {loading ? (
          <p className="p-5 text-sm text-[var(--color-muted)] jv-pulse">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-muted)]">
            {tab === 'refund'
              ? 'No refunds yet. When one happens, it lands here on its own.'
              : 'Nothing here yet.'}
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <Badge
                    tone={
                      entry.kind === 'refund'
                        ? 'good'
                        : entry.kind === 'spend'
                          ? 'muted'
                          : entry.kind === 'grant'
                            ? 'blue'
                            : 'pink'
                    }
                  >
                    {entry.kind}
                  </Badge>
                  <time
                    dateTime={entry.created_at}
                    className="text-xs text-[var(--color-faint)]"
                  >
                    {new Date(entry.created_at).toLocaleString()}
                  </time>
                </div>
                <p className="text-sm text-[var(--color-muted)]">{entry.reason}</p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`font-bold tabular-nums ${
                    entry.amount_credits >= 0 ? 'text-[#8dffc4]' : 'text-[var(--color-text)]'
                  }`}
                >
                  {entry.amount_credits >= 0 ? '+' : ''}
                  {entry.amount_credits}
                </p>
                <p className="text-xs text-[var(--color-faint)] tabular-nums">
                  → {entry.balance_after}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="jv-card mt-6 p-5">
        <h2 className="text-lg font-bold">Keep this wallet</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Optional. Add an email and we will give you a recovery code so you can open this same
          wallet on another device. We do not email you anything else.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="wallet-email" className="sr-only">
            Email
          </label>
          <input
            id="wallet-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="jv-input"
          />
          <button type="button" onClick={() => void claim()} className="jv-btn jv-btn-ghost shrink-0">
            Save
          </button>
        </div>
        {claimCode ? (
          <code className="mt-3 block rounded-lg bg-black/50 px-3 py-2 font-mono text-lg tracking-widest text-[var(--color-yellow)]">
            {claimCode}
          </code>
        ) : null}
      </div>

      <div className="jv-card mt-4 p-5">
        <h2 className="text-lg font-bold">Want your money back?</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Unused balance is refundable on request. One button, prefilled — no retention flow, no
          three-step cancellation.
        </p>
        <button
          type="button"
          onClick={() => void requestPayout()}
          className="jv-btn jv-btn-ghost mt-4 !min-h-11 !text-sm"
        >
          Refund my {wallet.balance_credits} unused credits
        </button>
        {payoutLink ? (
          <a href={payoutLink} className="jv-btn jv-btn-primary mt-3 !min-h-11 !text-sm">
            Open the prefilled email
          </a>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="mt-4 text-sm text-[var(--color-blue)]">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
