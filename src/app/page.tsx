import Image from 'next/image';
import Link from 'next/link';
import { CREDIT_PACKS, creditsToUsd } from '@/lib/pricing';
import { MODELS, TASK_LIST, TASKS } from '@/lib/models';
import { SIGNUP_GRANT_CREDITS } from '@/lib/session';
import { TaskIcon } from '@/components/icons';
import { Section } from '@/components/ui';

export const dynamic = 'force-static';

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

export default function LandingPage() {
  return (
    <div className="pb-10">
      <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-10 sm:pt-16">
        <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-blue)]">
              {SIGNUP_GRANT_CREDITS} free credits · no signup
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
              AI video that doesn&apos;t play games
              <span className="jv-glow-pink text-[var(--color-pink)]"> with your money.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
              Credits that never expire. Refunds you don&apos;t have to ask for. Prices you see
              before you click. Same frontier models — Seedance 2.5, Kling 3, Wan 3, SOUL 2 —
              without the carnival.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/studio" className="jv-btn jv-btn-primary">
                Make something free
              </Link>
              <Link href="/promises" className="jv-btn jv-btn-ghost">
                Read the promises
              </Link>
            </div>
            <p className="mt-4 text-xs text-[var(--color-faint)]">
              No card. No email. First generation in under a minute.
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
              sizes="(max-width: 640px) 70vw, 360px"
              className="jv-drift mx-auto h-auto w-3/4 object-contain lg:w-full"
            />
          </div>
        </div>
      </section>

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

      <Section className="py-10" eyebrow="Start here" title="Four things. Not forty.">
        <p className="-mt-4 mb-6 max-w-2xl text-sm text-[var(--color-muted)]">
          No model grid, no preset maze. Pick the job, write a sentence, press the button. The
          model is chosen for you and tucked under Advanced if you ever want it.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {TASK_LIST.map((task) => (
            <Link key={task.id} href="/studio" className="jv-card group p-5 transition-colors hover:border-[var(--color-pink)]">
              <TaskIcon
                name={task.icon}
                className="mb-3 h-7 w-7 text-[var(--color-blue)] transition-colors group-hover:text-[var(--color-pink)]"
              />
              <h3 className="mb-1 font-bold leading-tight">{task.title}</h3>
              <p className="text-xs leading-snug text-[var(--color-muted)]">{task.blurb}</p>
              <p className="mt-3 text-xs font-bold text-[var(--color-yellow)]">
                Draft {MODELS[task.draftModel].credits} cr · Final{' '}
                {MODELS[task.finalModel].credits} cr
              </p>
            </Link>
          ))}
        </div>
      </Section>

      <Section className="py-10" eyebrow="Draft, then final" title="Stop paying premium to find out it is wrong">
        <div className="jv-card p-5 sm:p-7">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-bold text-[var(--color-blue)]">1 · Draft it cheap</p>
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">
                {MODELS[TASKS.cinematic_shot.draftModel].credits} credits (
                {creditsToUsd(MODELS[TASKS.cinematic_shot.draftModel].credits)}) buys a fast, low-res
                pass. Iterate until the idea is right.
              </p>
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-[var(--color-pink)]">2 · Upgrade the keeper</p>
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">
                One click promotes the draft you liked to{' '}
                {MODELS[TASKS.cinematic_shot.finalModel].label}, reusing the exact prompt and
                settings. You pay the premium rate once, on the one you want.
              </p>
            </div>
          </div>
        </div>
      </Section>

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
          so there is nothing to work out and nothing to regret.
        </p>
        <div className="mt-6">
          <Link href="/pricing" className="jv-btn jv-btn-ghost">
            See the full table
          </Link>
        </div>
      </Section>

      <Section className="py-10" title="How this compares">
        <div className="jv-card overflow-hidden">
          <table className="w-full text-left text-sm">
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
                ['Your billing period rolls over', 'Unused credits vanish', 'Nothing happens. They are yours.'],
                ['A generation fails', 'You open a support ticket', 'Refunded before you ask'],
                ['Moderation blocks you', 'Charged anyway, no reason given', 'Costs $0, plain-English reason, one-click rewrite'],
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
              Open the studio
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
