import type { Metadata } from 'next';
import Link from 'next/link';
import { callPublic } from '@/lib/db';
import GalleryGrid, { type GalleryItem } from '@/components/gallery-grid';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Made with JellyVid',
  description: 'Everything people have made and chosen to publish.',
};

export default async function GalleryPage() {
  let items: GalleryItem[] = [];
  try {
    items = await callPublic<GalleryItem[]>('jv_gallery', { p_limit: 48 });
  } catch {
    items = [];
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-10">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Made with JellyVid</h1>
      <p className="mt-3 max-w-2xl text-[var(--color-muted)]">
        Everything here was published on purpose by the person who made it. Tap one to see the
        prompt and the model behind it.
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
