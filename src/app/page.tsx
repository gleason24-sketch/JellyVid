import Image from 'next/image';
import Link from 'next/link';
import { callPublic } from '@/lib/db';
import { isMockMode } from '@/lib/env';
import GalleryGrid, { type GalleryItem } from '@/components/gallery-grid';
import HeroReel from '@/components/hero-reel';
import SceneTile from '@/components/scene-tile';
import { MODELS, STAR_PRESETS, TASKS } from '@/lib/models';
import { REEL, REEL_PORTRAIT, reelAsGallery } from '@/lib/reel';
import { SIGNUP_GRANT_CREDITS } from '@/lib/session';
import { creditsToUsd } from '@/lib/pricing';

// Statically rendered for speed, regenerated every five minutes so the gallery
// stays alive and a server-config change (notably HF_MOCK, which the demo
// banner reflects) cannot stay baked into the HTML until the next deploy.
export const revalidate = 300;

export default async function LandingPage() {
  let gallery: GalleryItem[] = [];
  let stats: { generations?: number; credits_refunded?: number } = {};
  try {
    [gallery, stats] = await Promise.all([
      isMockMode()
        ? Promise.resolve<GalleryItem[]>([])
        : callPublic<GalleryItem[]>('jv_gallery', { p_limit: 12 }),
      callPublic<{ generations: number; credits_refunded: number }>('jv_stats'),
    ]);
  } catch {
    /* an empty page is better than a fabricated one */
  }
  // Placeholder outputs are never shown as if they were real work; the reel
  // stands in for the gallery until real generation is switched on.
  const featured = [...gallery, ...reelAsGallery()].slice(0, 12);

  const draft = MODELS[TASKS.star_in_it.draftModel].credits;
  const final = MODELS[TASKS.star_in_it.finalModel].credits;

  return (
    <div>
      {/* ------------------------------------------------------------ hero --- */}
      <section className="relative overflow-hidden px-4 pb-8 pt-10 sm:pt-16">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-18rem] -z-10 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(255,43,214,0.28), transparent 68%)' }}
        />

        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="jv-eyebrow mb-5 flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-pink)] jv-pulse" />
              {SIGNUP_GRANT_CREDITS} free credits · no signup
            </p>

            <h1 className="jv-display max-w-3xl text-[clamp(2.75rem,12vw,7rem)]">
              Put yourself
              <br />
              in the <span className="text-[var(--color-pink)]">movie</span>.
            </h1>

            <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-[var(--color-muted)] sm:text-lg">
              One selfie. One tap. A cinematic video of you in it — about a minute later.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/studio" className="jv-btn jv-btn-primary">
                Put me in a scene
              </Link>
              <Link href="/gallery" className="jv-btn jv-btn-ghost">
                See the gallery
              </Link>
            </div>

            <p className="mt-5 text-xs text-[var(--color-faint)]">
              Seedance 2.5 with face inputs, via the Higgsfield API
            </p>
          </div>

          {/* The demo, not a description of it: one face, every scene. */}
          {REEL.length > 0 ? (
            <div className="pt-4 lg:pt-0">
              <HeroReel clips={REEL} portrait={REEL_PORTRAIT} />
              <p className="mt-5 text-center text-xs text-[var(--color-faint)]">
                Every clip above was cast from that one photo. Same model you get.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* --------------------------------------------------------- scenes --- */}
      <section className="px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="jv-eyebrow mb-2">Pick a scene</p>
              <h2 className="jv-display text-[clamp(1.6rem,6vw,2.75rem)]">
                Eight looks. No prompt writing.
              </h2>
            </div>
            <Link
              href="/studio?task=star_in_it"
              className="hidden shrink-0 text-sm font-semibold text-[var(--color-muted)] transition-colors hover:text-white sm:block"
            >
              All scenes →
            </Link>
          </div>

          {/* A rail on phones, a grid from tablet up. */}
          <div className="jv-rail -mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 lg:grid-cols-8">
            {STAR_PRESETS.map((preset) => (
              <div key={preset.id} className="w-[44vw] shrink-0 snap-start sm:w-auto">
                <SceneTile preset={preset} href={`/studio?task=star_in_it&scene=${preset.id}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- gallery --- */}
      {featured.length > 0 ? (
        <section className="px-4 py-8 sm:py-12">
          <div className="mx-auto max-w-7xl">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="jv-eyebrow mb-2">Made here</p>
                <h2 className="jv-display text-[clamp(1.6rem,6vw,2.75rem)]">
                  {gallery.length > 0 ? 'Published by their makers' : 'One face. Eight films.'}
                </h2>
              </div>
              <Link
                href="/gallery"
                className="hidden shrink-0 text-sm font-semibold text-[var(--color-muted)] transition-colors hover:text-white sm:block"
              >
                See all →
              </Link>
            </div>
            <GalleryGrid items={featured} />
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ how --- */}
      <section className="px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <p className="jv-eyebrow mb-2">How it works</p>
          <h2 className="jv-display mb-7 text-[clamp(1.6rem,6vw,2.75rem)]">Three steps</h2>

          <ol className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-line-soft)] sm:grid-cols-3">
            {[
              ['Upload a selfie', 'One to three photos. Clear and well lit is all it needs.'],
              ['Pick a scene', 'Eight cinematic looks, each already directed for you.'],
              [
                'Get your video',
                `A ${draft}-credit draft first. Like it? One tap makes it the ${final}-credit final.`,
              ],
            ].map(([title, body], index) => (
              <li key={title} className="bg-[var(--color-surface)] p-6">
                <span className="jv-display block text-4xl text-[var(--color-line)]">
                  0{index + 1}
                </span>
                <h3 className="mt-3 text-base font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------- promises --- */}
      <section className="px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-7xl">
          <p className="jv-eyebrow mb-2">The deal</p>
          <h2 className="jv-display mb-7 text-[clamp(1.6rem,6vw,2.75rem)]">
            No games with your money
          </h2>

          <div className="grid gap-px overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-line-soft)] sm:grid-cols-3">
            {[
              ['Credits never expire', 'There is no expiry column in our database.', 'pink'],
              ['Refunds happen on their own', 'Failed, blocked or duplicate? Already back.', 'blue'],
              ['The price is on the button', 'Before you press it, not after.', 'yellow'],
            ].map(([title, body, tone]) => (
              <div key={title} className="bg-[var(--color-surface)] p-6">
                <div
                  className="mb-4 h-0.5 w-8"
                  style={{ background: `var(--color-${tone})` }}
                />
                <h3 className="text-base font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">{body}</p>
              </div>
            ))}
          </div>

          {stats.credits_refunded ? (
            <p className="mt-4 text-sm text-[var(--color-muted)]">
              <strong className="text-white">{creditsToUsd(stats.credits_refunded)}</strong> refunded
              automatically so far, across{' '}
              <strong className="text-white">{stats.generations?.toLocaleString()}</strong>{' '}
              generations.{' '}
              <Link href="/stats" className="text-[var(--color-blue)] underline-offset-4 hover:underline">
                Live numbers
              </Link>
            </p>
          ) : null}
        </div>
      </section>

      {/* ----------------------------------------------------------- close --- */}
      <section className="px-4 py-12 sm:py-16">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] px-6 py-14 text-center sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-[-12rem] h-[24rem] blur-[100px]"
            style={{
              background: 'radial-gradient(circle at 50% 50%, rgba(255,43,214,0.35), transparent 70%)',
            }}
          />
          <Image
            src="/logo-128.png"
            alt=""
            width={44}
            height={44}
            className="mx-auto mb-6 h-11 w-11 object-contain"
          />
          <h2 className="jv-display text-[clamp(1.9rem,8vw,4rem)]">
            {SIGNUP_GRANT_CREDITS} credits.
            <br />
            Already yours.
          </h2>
          <p className="mx-auto mt-4 max-w-sm text-sm text-[var(--color-muted)]">
            No card. No email. No expiry.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/studio" className="jv-btn jv-btn-primary">
              Put me in a scene
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
