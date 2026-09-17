import type { Metadata } from 'next';
import Link from 'next/link';
import { callPublic } from '@/lib/db';
import { isMockMode } from '@/lib/env';
import GalleryGrid, { type GalleryItem } from '@/components/gallery-grid';
import { reelAsGallery } from '@/lib/reel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Made with JellyVid',
  description: 'Everything people have made and chosen to publish.',
};

export default async function GalleryPage() {
  let items: GalleryItem[] = [];
  try {
    // Placeholder outputs are not shown as real work while generation is mocked.
    items = isMockMode() ? [] : await callPublic<GalleryItem[]>('jv_gallery', { p_limit: 48 });
  } catch {
    items = [];
  }
  items = [...items, ...reelAsGallery()];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-10">
      <h1 className="jv-display text-[clamp(2rem,9vw,3.5rem)]">Made with JellyVid</h1>
      <p className="mt-3 max-w-2xl text-[var(--color-muted)]">
        Published on purpose by the people who made them. The first eight are our demo reel — one
        synthetic face, cast into every scene. Tap any to put yourself in it.
      </p>

      <div className="mt-8">
        <GalleryGrid items={items} />
      </div>

      <div className="mt-10">
        <Link href="/studio" className="jv-btn jv-btn-primary">
          Make yours free
        </Link>
      </div>
    </div>
  );
}
