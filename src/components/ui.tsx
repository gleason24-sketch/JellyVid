import Link from 'next/link';
import type { ReactNode } from 'react';

export function Badge({
  tone,
  children,
}: {
  tone: 'pink' | 'blue' | 'yellow' | 'muted' | 'good';
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    pink: 'text-[var(--color-pink-soft)] bg-[rgba(255,43,214,0.10)]',
    blue: 'text-[var(--color-blue)] bg-[rgba(111,233,255,0.10)]',
    yellow: 'text-[var(--color-yellow)] bg-[rgba(242,255,92,0.10)]',
    good: 'text-[#8dffc4] bg-[rgba(141,255,196,0.10)]',
    muted: 'text-[var(--color-muted)] bg-[rgba(255,255,255,0.05)]',
  };
  return <span className={`jv-chip ${tones[tone]}`}>{children}</span>;
}

/**
 * Every balance in the app renders through this, so the "never expires" promise
 * physically cannot be shown without its guarantee attached.
 */
export function BalanceDisplay({
  credits,
  size = 'md',
}: {
  credits: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl',
  };
  return (
    <div>
      <div className={`${sizes[size]} font-extrabold tabular-nums jv-glow-pink`}>
        {credits.toLocaleString()}{' '}
        <span className="text-[0.5em] font-semibold text-[var(--color-muted)]">credits</span>
      </div>
      <div className="mt-1 text-xs font-semibold tracking-wide text-[var(--color-blue)]">
        Never expires
      </div>
    </div>
  );
}

export function Section({
  title,
  eyebrow,
  children,
  className = '',
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mx-auto w-full max-w-6xl px-4 ${className}`}>
      {eyebrow ? (
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-blue)]">
          {eyebrow}
        </p>
      ) : null}
      {title ? <h2 className="mb-6 text-2xl font-extrabold sm:text-3xl">{title}</h2> : null}
      {children}
    </section>
  );
}

export function CTA({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="jv-btn jv-btn-primary">
      {children}
    </Link>
  );
}
