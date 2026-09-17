'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Mobile tab bar.
 *
 * A generation tool lives on a phone, and a phone expects a thumb-reachable
 * bar rather than a hamburger. Create sits in the middle as the one accented
 * control on the screen.
 */
interface Tab {
  href: string;
  label: string;
  icon: string;
  primary?: boolean;
}

const TABS: Tab[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/gallery', label: 'Gallery', icon: 'grid' },
  { href: '/studio', label: 'Create', icon: 'plus', primary: true },
  { href: '/wallet', label: 'Wallet', icon: 'wallet' },
  { href: '/stats', label: 'Stats', icon: 'chart' },
];

function Icon({ name }: { name: string }) {
  const p = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'h-[22px] w-[22px]',
  };
  switch (name) {
    case 'home':
      return (
        <svg {...p}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...p}>
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...p} strokeWidth={2.4}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...p}>
          <rect x="3" y="6" width="18" height="13" rx="2.5" />
          <path d="M3 10h18" />
          <circle cx="17" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
  }
}

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-line-soft)] bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
    >
      <ul className="mx-auto flex max-w-md items-center justify-around px-2">
        {TABS.map((tab) => {
          const active =
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);

          if (tab.primary) {
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-label={tab.label}
                  className="flex h-12 w-14 items-center justify-center rounded-2xl bg-[var(--color-pink)] text-white shadow-[0_8px_28px_-10px_rgba(255,43,214,0.95)]"
                >
                  <Icon name={tab.icon} />
                </Link>
              </li>
            );
          }

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[58px] w-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors ${
                  active ? 'text-white' : 'text-[var(--color-faint)]'
                }`}
              >
                <Icon name={tab.icon} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
