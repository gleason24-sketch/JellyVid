import Link from 'next/link';
import type { ScenePreset } from '@/lib/models';

/**
 * A scene tile.
 *
 * With a preview clip it plays the clip. Without one it renders as a poster —
 * the scene's own palette, its name set large — which reads as a deliberate
 * design rather than a missing asset. Both states share the same geometry, so
 * dropping real previews in later changes nothing about the layout.
 */
export default function SceneTile({
  preset,
  href,
  size = 'md',
}: {
  preset: ScenePreset;
  href: string;
  size?: 'sm' | 'md';
}) {
  const [from, to] = preset.tone;

  return (
    <Link
      href={href}
      className="jv-tile group block aspect-[3/4] transition-transform duration-200 hover:-translate-y-1"
    >
      {preset.previewUrl ? (
        <video
          src={preset.previewUrl}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: `linear-gradient(155deg, ${from} -20%, ${to} 62%, #000 100%)` }}
          />
          {/* A soft light bloom so the flat field reads as a lit scene. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-70 mix-blend-screen"
            style={{
              background: `radial-gradient(70% 45% at 72% 18%, ${from}55, transparent 70%)`,
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0 1px, transparent 1px 3px)',
            }}
          />
        </>
      )}

      <div className="jv-tile-label">
        <p
          className={`jv-display text-white ${size === 'sm' ? 'text-[15px]' : 'text-lg sm:text-xl'}`}
        >
          {preset.label}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-white/60">{preset.hint}</p>
      </div>
    </Link>
  );
}
