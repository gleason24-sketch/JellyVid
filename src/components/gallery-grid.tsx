import Link from 'next/link';
import { TASKS, type TaskId } from '@/lib/models';

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
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

export default function GalleryGrid({ items }: { items: GalleryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="jv-card p-8 text-center">
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const label = TASKS[item.task as TaskId]?.title ?? item.task.replace(/_/g, ' ');
        return (
          <Link
            key={item.share_slug}
            href={`/s/${item.share_slug}`}
            className="jv-card group relative block overflow-hidden transition-transform hover:-translate-y-0.5"
          >
            <div className="aspect-[9/16] w-full bg-black">
              {isVideoUrl(item.output_url) ? (
                <video
                  src={item.output_url}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster={item.poster_url ?? undefined}
                  className="h-full w-full object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.output_url}
                  alt={item.prompt}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-blue)]">
                {label}
              </p>
              <p className="line-clamp-2 text-xs leading-snug text-[var(--color-text)]">
                {item.prompt}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
