'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { ReelClip } from '@/lib/reel';

/**
 * The hero is the demo: a selfie on the left, and on the right that same face
 * moving through scene after scene. Each clip plays through once and hands off
 * to the next with a short crossfade, so the identity carries visibly from one
 * to the next — which is the whole point.
 */
export default function HeroReel({
  clips,
  portrait,
}: {
  clips: ReelClip[];
  portrait: string;
}) {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  // Advance on the clip's own `ended` event rather than a timer, so a slow
  // network never cuts a scene short.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = () => setIndex((current) => (current + 1) % clips.length);
    video.addEventListener('ended', next);
    video.play().catch(() => {
      /* autoplay can be refused; the poster still shows the scene */
    });
    return () => video.removeEventListener('ended', next);
  }, [index, clips.length]);

  if (clips.length === 0) return null;
  const current = clips[index];

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      {/* Phone frame around the reel, so it reads as "what you get on your phone". */}
      <div className="jv-tile aspect-[9/16] w-full ring-1 ring-white/10">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `linear-gradient(155deg, ${current.scene.tone[0]} -20%, ${current.scene.tone[1]} 62%, #000 100%)`,
          }}
        />
        <video
          key={current.src}
          ref={videoRef}
          src={current.src}
          muted
          playsInline
          autoPlay
          loop={reduced}
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="jv-tile-label !pb-4">
          <p className="jv-eyebrow !text-white/60">Scene {index + 1} of {clips.length}</p>
          <p className="jv-display mt-1 text-2xl text-white">{current.scene.label}</p>
        </div>

        {/* Progress ticks: one per scene, the current one lit. */}
        <div className="absolute inset-x-3 top-3 flex gap-1" aria-hidden>
          {clips.map((clip, i) => (
            <span
              key={clip.src}
              className={`h-0.5 flex-1 rounded-full ${i === index ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>
      </div>

      {/* The selfie that all of this came from, pinned to the corner. */}
      <div className="absolute -left-3 bottom-8 w-[34%] rotate-[-6deg] sm:-left-8">
        <div className="jv-tile aspect-[3/4] ring-2 ring-black shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9)]">
          <Image
            src={portrait}
            alt="The single selfie every scene was cast from"
            fill
            sizes="160px"
            className="object-cover"
            priority
          />
        </div>
        <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
          One selfie ↑
        </p>
      </div>
    </div>
  );
}
