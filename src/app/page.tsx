import Image from 'next/image';
import Link from 'next/link';
import { callPublic } from '@/lib/db';
import GalleryGrid, { type GalleryItem } from '@/components/gallery-grid';
import { CREDIT_PACKS, creditsToUsd } from '@/lib/pricing';
import { MODELS, STAR_PRESETS, TASKS } from '@/lib/models';
import { SIGNUP_GRANT_CREDITS } from '@/lib/session';
import { Section } from '@/components/ui';

// Statically rendered for speed, but regenerated every five minutes so the
// gallery stays alive and a server-config change (notably HF_MOCK, which the
// demo banner reflects) cannot stay baked into the HTML until the next deploy.
export const revalidate = 300;

const PROMISES = [
  {
    title: 'Credits never expire',
    body: 'Not at renewal, not after 30 days, not ever. There is no expiry column in our database — we could not take them back if we wanted to.',
    tone: 'pink',
  },
  {
    title: 'Refunds you do not have to ask for',
    body: 'Failed, blocked, timed out, or a near-identical repeat? The credits are back in your wallet before you notice, with a line in your ledger saying why.',
    tone: 'blue',
  },
  {
    title: 'The price is on the button',
    body: 'Every Generate button says exactly what it costs before you press it. If the price changed while you were reading, we refuse the job rather than charge the new one.',
    tone: 'yellow',
  },
];

export default async function LandingPage() {
  let gallery: GalleryItem[] = [];
  try {
    gallery = await callPublic<GalleryItem[]>('jv_gallery', { p_limit: 8 });
  } catch {
    gallery = [];
  }

  const draft = MODELS[TASKS.star_in_it.draftModel].credits;
  const final = MODELS[TASKS.star_in_it.finalModel].credits;

  return (
    <div className="pb-10">
      {/* ------------------------------------------------------------ hero --- */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-10 sm:pt-14">
        <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-blue)]">
              {SIGNUP_GRANT_CREDITS} free credits · no signup
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.04] sm:text-5xl lg:text-6xl">
              Put yourself in
              <span className="jv-glow-pink text-[var(--color-pink)]"> the movie.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
              Upload one selfie. Pick a scene. Get a cinematic video of{' '}
              <em className="not-italic text-[var(--color-text)]">you</em> in it, in about a minute.
              No app, no signup, no API key.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/studio" className="jv-btn jv-btn-primary">
                Put me in a scene — free
              </Link>
              <Link href="/gallery" className="jv-btn jv-btn-ghost">
                See what people made
              </Link>
            </div>
            <p className="mt-4 text-xs text-[var(--color-faint)]">
              Runs on Seedance 2.5 with face inputs, through the Higgsfield API.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 blur-3xl"
              style={{
                background:
                  'radial-gradient(circle at 50% 45%, rgba(255,43,214,0.5), transparent 62%)',
              }}
            />
            <Image
              src="/logo-512.png"
              alt=""
              width={512}
              height={512}
              priority
              sizes="(max-width: 640px) 60vw, 360px"
              className="jv-drift mx-auto h-auto w-3/5 object-contain lg:w-4/5"
            />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- scenes --- */}
      <Section className="py-8" eyebrow="One tap" title="Eight scenes. No prompt writing.">
        <p className="-mt-4 mb-6 max-w-2xl text-sm text-[var(--color-muted)]">
          You do not have to know how to prompt. Pick the look and we write the shot — camera move,
          lighting, lens, grade — then you can edit it if you want.
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {STAR_PRESETS.map((preset) => (
            <Link
              key={preset.id}
              href="/studio?task=star_in_it"
              className="jv-card p-4 transition-colors hover:border-[var(--color-pink)]"
            >
              <p className="text-sm font-bold leading-tight">{preset.label}</p>
              <p className="mt-1 text-xs leading-snug text-[var(--color-muted)]">{preset.hint}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* -------------------------------------------------------- gallery --- */}
      {gallery.length > 0 ? (
        <Section className="py-10" eyebrow="Made here" title="Real outputs, published by their makers">
          <GalleryGrid items={gallery.slice(0, 8)} />
          <div className="mt-6">
            <Link href="/gallery" className="jv-btn jv-btn-ghost">
              See the whole gallery
            </Link>
          </div>
        </Section>
      ) : null}

      {/* ----------------------------------------------------- how it works --- */}
      <Section className="py-10" eyebrow="How it works" title="Three steps, about a minute">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['1', 'Upload a selfie', 'One to three photos of the face. Clear and well lit is all it needs.'],
            ['2', 'Pick a scene', 'Neon city, action hero, film noir, 80s music video — eight to choose from.'],
            ['3', 'Get your video', `A ${draft}-credit draft first. Like it? One tap upgrades it to the ${final}-credit final.`],
          ].map(([step, title, body]) => (
            <div key={step} className="jv-card p-5">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-pink)] text-sm font-extrabold text-white">
                {step}
              </div>
              <h3 className="mb-1.5 font-bold">{title}</h3>
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* -------------------------------------------------------- promises --- */}
      <Section className="py-10" eyebrow="The deal" title="Three promises, kept in the code">
        <div className="grid gap-4 sm:grid-cols-3">
          {PROMISES.map((promise) => (
            <div key={promise.title} className="jv-card p-5">
              <div
                className="mb-3 h-1 w-10 rounded-full"
                style={{ background: `var(--color-${promise.tone})` }}
              />
              <h3 className="mb-2 text-lg font-bold">{promise.title}</h3>
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">{promise.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* --------------------------------------------------------- pricing --- */}
      <Section className="py-10" eyebrow="Pricing" title="One rate. Every pack. No subscription.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {CREDIT_PACKS.map((pack) => (
            <div key={pack.id} className="jv-card p-4">
              <p className="text-2xl font-extrabold tabular-nums">{pack.credits.toLocaleString()}</p>
              <p className="text-xs text-[var(--color-muted)]">credits</p>
              <p className="mt-3 text-lg font-bold text-[var(--color-pink)]">
                ${(pack.priceCents / 100).toFixed(0)}
              </p>
              <p className="mt-1 text-xs text-[var(--color-faint)]">{pack.yardstick}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Every pack is 1 credit for 1 cent. A bigger pack buys more credits, never cheaper ones —
          so there is nothing to work out and nothing to regret. A finished video is{' '}
          {creditsToUsd(final)}.
        </p>
        <div className="mt-6">
          <Link href="/pricing" className="jv-btn jv-btn-ghost">
            See the full table
          </Link>
        </div>
      </Section>

      {/* ------------------------------------------------------ comparison --- */}
      <Section className="py-10" title="How this compares">
        <div className="jv-card overflow-x-auto">
          <table className="w-full min-w-[340px] text-left text-sm">
            <caption className="sr-only">
              JellyVid compared with the typical AI generation studio
            </caption>
            <thead className="border-b border-[var(--color-line)] text-xs uppercase tracking-wider text-[var(--color-muted)]">
              <tr>
                <th scope="col" className="p-3 font-bold">What happens when…</th>
                <th scope="col" className="p-3 font-bold">A typical studio</th>
                <th scope="col" className="p-3 font-bold text-[var(--color-pink)]">JellyVid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {[
                ['You want to try it', 'Sign up, pick a plan, add a card', 'Type a prompt. That is it.'],
                ['Your billing period rolls over', 'Unused credits vanish', 'Nothing happens. They are yours.'],
                ['A generation fails', 'You open a support ticket', 'Refunded before you ask'],
                ['Moderation blocks you', 'Charged anyway, no reason given', 'Costs $0, plain reason, one-click rewrite'],
                ['A re-roll returns the same image', 'You pay again', 'Detected and refunded automatically'],
                ['You want to stop', 'Buried cancellation flow', 'One button refunds the unused balance'],
              ].map(([scenario, them, us]) => (
                <tr key={scenario}>
                  <th scope="row" className="p-3 text-left font-semibold">{scenario}</th>
                  <td className="p-3 text-[var(--color-muted)]">{them}</td>
                  <td className="p-3 font-semibold text-[var(--color-text)]">{us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--color-faint)]">
          &ldquo;A typical studio&rdquo; describes patterns users report across this category. We are
          not describing any one company.
        </p>
      </Section>

      <Section className="py-14">
        <div className="jv-card p-7 text-center sm:p-10">
          <h2 className="text-2xl font-extrabold sm:text-3xl">
            {SIGNUP_GRANT_CREDITS} credits are already yours.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-[var(--color-muted)]">
            Enough for two drafts and one finished video. No card, no email, no expiry.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/studio" className="jv-btn jv-btn-primary">
              Put me in a scene
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
