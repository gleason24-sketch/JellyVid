import Link from 'next/link';
import { TASKS, type TaskId } from '@/lib/models';
import LazyVideo from './lazy-video';

export interface GalleryItem {
  share_slug: string;
  task: string;
  tier: string;
  kind: 'image' | 'video';
  model_id: string;
  prompt: string;
  output_url: string;
  poster_url: string | null;
  created_at: string;
  /** Overrides the share-page link; used by curated reel seeds. */
  href?: string;
  /** Curated seeds autoplay so the grid moves; user posts play on hover/tap. */
  autoplay?: boolean;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

export default function GalleryGrid({ items }: { items: GalleryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="jv-panel p-8 text-center">
        <p className="text-sm text-[var(--color-muted)]">
          Nothing published yet. Make something and hit Share — yours would be first.
        </p>
        <Link href="/studio" className="jv-btn jv-btn-primary mt-5">
          Open the studio
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => {
        const label = TASKS[item.task as TaskId]?.title ?? item.task.replace(/_/g, ' ');
        return (
          <Link
            key={item.href ?? item.share_slug}
            href={item.href ?? `/s/${item.share_slug}`}
            className="jv-tile group block aspect-[3/4] transition-transform duration-200 hover:-translate-y-1"
          >
            {isVideoUrl(item.output_url) && item.autoplay ? (
              <LazyVideo
                src={item.output_url}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : isVideoUrl(item.output_url) ? (
              <video
                src={item.output_url}
                muted
                loop
                playsInline
                preload="metadata"
                poster={item.poster_url ?? undefined}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.output_url}
                alt={item.prompt}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="jv-tile-label">
              <p className="jv-display text-[11px] text-white/50">{label}</p>
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-white">
                {item.prompt}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
