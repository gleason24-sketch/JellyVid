'use client';

import { useEffect, useRef } from 'react';

/**
 * A muted, looping clip that only loads and plays while it is on screen.
 *
 * The landing page carries a dozen clips. Autoplaying all of them at once is
 * 17 MB on first paint and a dozen decoders running on a phone. With this,
 * a tile costs nothing until it scrolls into view, pauses when it leaves, and
 * the poster painted beneath it is what shows in the meantime. Honours
 * prefers-reduced-motion by never starting playback at all.
 */
export default function LazyVideo({
  src,
  className,
  threshold = 0.35,
}: {
  src: string;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {
            /* autoplay refused: the poster underneath stays visible */
          });
        } else {
          video.pause();
        }
      },
      { threshold },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      preload="none"
      className={className}
    />
  );
}
