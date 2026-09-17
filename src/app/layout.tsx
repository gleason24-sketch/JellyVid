import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import Link from 'next/link';
import Image from 'next/image';
import DemoBanner from '@/components/demo-banner';
import TabBar from '@/components/tab-bar';
import './globals.css';

// One family, full weight range. The display weights (800/900) set uppercase
// and tight, which is what gives a studio site its voice.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

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
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl">
      <nav
        className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3"
        aria-label="Main navigation"
      >
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="JellyVid home">
          <Image
            src="/logo-128.png"
            alt=""
            width={28}
            height={28}
            priority
            className="h-7 w-7 object-contain"
          />
          <span className="jv-display text-[17px]">JellyVid</span>
        </Link>

        {/* Desktop links. On phones this is the bottom tab bar instead. */}
        <div className="ml-auto hidden items-center gap-1 text-sm sm:flex">
          {[
            ['/gallery', 'Gallery'],
            ['/pricing', 'Pricing'],
            ['/stats', 'Stats'],
            ['/wallet', 'Wallet'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-full px-3 py-2 font-medium text-[var(--color-muted)] transition-colors hover:text-white"
            >
              {label}
            </Link>
          ))}
          <Link href="/studio" className="jv-btn jv-btn-light !min-h-9 !px-4 !text-sm">
            Create
          </Link>
        </div>

        <Link
          href="/studio"
          className="jv-btn jv-btn-primary ml-auto !min-h-9 whitespace-nowrap !px-4 !text-sm sm:hidden"
        >
          Create
        </Link>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 px-4 py-10">
      <div className="jv-hr mx-auto mb-8 max-w-7xl" />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 text-sm text-[var(--color-muted)] sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <div className="mb-2 flex items-center gap-2">
            <Image src="/logo-128.png" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
            <span className="jv-display text-sm text-white">JellyVid</span>
          </div>
          <p className="leading-relaxed">
            Credits never expire. Failed generations refund themselves. The price is on the button.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
          {[
            ['/studio', 'Studio'],
            ['/gallery', 'Gallery'],
            ['/pricing', 'Pricing'],
            ['/wallet', 'Wallet'],
            ['/stats', 'Stats'],
            ['/promises', 'Promises'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center transition-colors hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-7xl text-xs text-[var(--color-faint)]">
        Generation runs on the Higgsfield API. JellyVid is an independent product and is not
        affiliated with any model provider.
      </p>
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="font-[family-name:var(--font-archivo)] antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--color-pink)] focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <Nav />
        <DemoBanner />
        {/* pb-24 on mobile clears the fixed tab bar. */}
        <main id="main" className="pb-24 sm:pb-0">
          {children}
        </main>
        <Footer />
        <TabBar />
      </body>
    </html>
  );
}
