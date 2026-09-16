import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { callPublic } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface Share {
  id: string;
  kind: 'image' | 'video';
  task: string;
  tier: string;
  model_id: string;
  prompt: string;
  output_url: string;
  poster_url: string | null;
  created_at: string;
  share_slug: string;
}

async function loadShare(slug: string): Promise<Share | null> {
  try {
    return await callPublic<Share | null>('jv_share_get', { p_slug: slug });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const share = await loadShare(slug);
  if (!share) return { title: 'Not found' };
  const title = share.prompt.slice(0, 70);
  return {
    title,
    description: `Made with JellyVid — ${share.model_id}.`,
    openGraph: {
      title,
      description: 'Made with JellyVid. Credits that never expire.',
      images: share.kind === 'image' ? [share.output_url] : [share.poster_url ?? '/icon-512.png'],
    },
  };
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const share = await loadShare(slug);
  if (!share) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-8">
      <div className="jv-card overflow-hidden">
        {isVideoUrl(share.output_url) ? (
          <video
            src={share.output_url}
            controls
            playsInline
            poster={share.poster_url ?? undefined}
            className="w-full bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={share.output_url} alt={share.prompt} className="w-full bg-black" />
        )}

        <div className="p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--color-blue)]">
            {share.task.replace(/_/g, ' ')} · {share.tier}
          </p>
          <p className="mt-2 text-lg font-semibold leading-snug">{share.prompt}</p>
          <p className="mt-3 text-xs text-[var(--color-faint)]">
            {share.model_id} · {new Date(share.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="jv-card mt-5 p-6 text-center">
        <h2 className="text-xl font-extrabold">Made with JellyVid</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-muted)]">
          Credits that never expire. Refunds you don&apos;t have to ask for. 200 free credits, no
          signup.
        </p>
        <div className="mt-5 flex justify-center">
          <Link href="/studio" className="jv-btn jv-btn-primary">
            Make yours
          </Link>
        </div>
      </div>
    </div>
  );
}
