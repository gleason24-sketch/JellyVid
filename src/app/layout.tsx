import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jellyvid.com'),
  title: {
    default: 'JellyVid — AI video that does not play games with your money',
    template: '%s · JellyVid',
  },
  description:
    'Credits that never expire. Refunds you do not have to ask for. Prices you see before you click. AI video and image generation, built to be honest.',
  applicationName: 'JellyVid',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    siteName: 'JellyVid',
    title: 'JellyVid — AI video that does not play games with your money',
    description:
      'Credits that never expire. Refunds you do not have to ask for. Prices you see before you click.',
    images: ['/icon-512.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JellyVid',
    description: 'Credits that never expire. Refunds you do not have to ask for.',
    images: ['/icon-512.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#08060c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-line)] bg-[rgba(8,6,12,0.82)] backdrop-blur-xl">
      <nav
        className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3"
        aria-label="Main navigation"
      >
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="JellyVid home">
          <Image
            src="/logo-128.png"
            alt=""
            width={32}
            height={32}
            priority
            className="h-8 w-8 object-contain"
          />
          <span className="text-lg font-extrabold tracking-tight jv-glow-pink">JellyVid</span>
        </Link>

        <div className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          <Link
            href="/pricing"
            className="rounded-full px-2.5 py-2 text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] sm:px-3"
          >
            Pricing
          </Link>
          <Link
            href="/stats"
            className="hidden rounded-full px-3 py-2 text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] sm:block"
          >
            Stats
          </Link>
          <Link
            href="/wallet"
            className="rounded-full px-2.5 py-2 text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] sm:px-3"
          >
            Wallet
          </Link>
          <Link href="/studio" className="jv-btn jv-btn-primary !min-h-10 !px-4 !text-sm">
            Open studio
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-[var(--color-line)] px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 text-sm text-[var(--color-muted)] sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <div className="mb-2 flex items-center gap-2">
            <Image src="/logo-128.png" alt="" width={24} height={24} className="h-6 w-6" />
            <span className="font-bold text-[var(--color-text)]">JellyVid</span>
          </div>
          <p>
            Credits never expire. Failed, blocked and duplicate generations refund themselves.
            You see the price before you click.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/studio" className="hover:text-[var(--color-text)]">Studio</Link>
          <Link href="/pricing" className="hover:text-[var(--color-text)]">Pricing</Link>
          <Link href="/wallet" className="hover:text-[var(--color-text)]">Wallet</Link>
          <Link href="/stats" className="hover:text-[var(--color-text)]">Stats</Link>
          <Link href="/promises" className="hover:text-[var(--color-text)]">Our promises</Link>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-xs text-[var(--color-faint)]">
        Generation runs on the Higgsfield API. JellyVid is an independent product and is not
        affiliated with any model provider.
      </p>
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--color-pink)] focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
