import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import DemoBanner from '@/components/demo-banner';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jellyvid.com'),
  title: {
    default: 'JellyVid — put yourself in the movie',
    template: '%s · JellyVid',
  },
  description:
    'Upload one selfie, pick a scene, get a cinematic video of you in it. 200 free credits, no signup. Credits never expire and failed generations refund themselves.',
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
    title: 'JellyVid — put yourself in the movie',
    description:
      'Upload one selfie, pick a scene, get a cinematic video of you in it. 200 free credits, no signup.',
    images: ['/icon-512.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JellyVid — put yourself in the movie',
    description: 'Upload one selfie, pick a scene, star in it. 200 free credits, no signup.',
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
        className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3"
        aria-label="Main navigation"
      >
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="JellyVid home">
          <Image
            src="/logo-128.png"
            alt=""
            width={32}
            height={32}
            priority
            className="h-7 w-7 object-contain sm:h-8 sm:w-8"
          />
          <span className="text-base font-extrabold tracking-tight jv-glow-pink sm:text-lg">
            JellyVid
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          {/* At 320px the bar cannot hold both text links plus the CTA; pricing
              is one tap away from the footer, the wallet and the studio. */}
          <Link
            href="/pricing"
            className="hidden rounded-full px-2.5 py-2 text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] min-[380px]:block sm:px-3"
          >
            Pricing
          </Link>
          <Link
            href="/gallery"
            className="hidden rounded-full px-3 py-2 text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] sm:block"
          >
            Gallery
          </Link>
          <Link
            href="/wallet"
            className="rounded-full px-2.5 py-2 text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] sm:px-3"
          >
            Wallet
          </Link>
          <Link
            href="/studio"
            className="jv-btn jv-btn-primary !min-h-10 whitespace-nowrap !px-4 !text-sm"
          >
            {/* "Open studio" wraps at 390px, so the phone gets the short label. */}
            <span className="sm:hidden">Studio</span>
            <span className="hidden sm:inline">Open studio</span>
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
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4">
          {[
            ['/studio', 'Studio'],
            ['/gallery', 'Gallery'],
            ['/pricing', 'Pricing'],
            ['/wallet', 'Wallet'],
            ['/stats', 'Stats'],
            ['/promises', 'Our promises'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              // py-2.5 keeps these above the 44px touch target on a phone.
              className="inline-flex min-h-11 items-center hover:text-[var(--color-text)]"
            >
              {label}
            </Link>
          ))}
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
        <DemoBanner />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
