import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Our promises',
  description: 'Ten specific complaints about AI generation studios, and exactly how JellyVid fixes each one.',
};

const PROMISES = [
  {
    complaint: 'Credits expire or vanish when the plan renews.',
    fix: 'Credits never expire. There is no expiry field in our database and no job that could clear one. Every screen that shows a balance shows "Never expires" next to it, because the API that returns a balance returns that guarantee with it.',
  },
  {
    complaint: 'Pricing shifts, and the annual plan is pre-selected for you.',
    fix: 'One flat rate: 1 credit = 1 cent, in every pack, with no volume discount to reverse-engineer. Pay as you go only — there are no subscriptions to renew, no pre-checked boxes, and no countdown timers anywhere in the product.',
  },
  {
    complaint: 'Failed generations are charged, and refunds need a support ticket.',
    fix: 'Refunds are automatic and immediate. A failure, timeout, cancellation, moderation block or duplicate puts the credits back in the same database statement that records the outcome — before you have noticed. Your wallet has a Refunds tab listing every one.',
  },
  {
    complaint: 'You pay for a re-roll and get the same image back.',
    fix: 'Every output is perceptually hashed. If a new result lands within 5 bits of something you already have for that prompt, it is labelled "Duplicate, refunded" and the credits return automatically. You do not pay twice for one picture.',
  },
  {
    complaint: 'Moderation blocks you with no reason, and charges you anyway.',
    fix: 'A moderation block costs exactly zero credits. You get a plain-English reason instead of a code, plus a one-click "Rewrite safely" button that rephrases your prompt and tells you what it changed.',
  },
  {
    complaint: 'The interface is a carnival of models, presets and menus.',
    fix: 'Four cards: product ad, talking character, cinematic shot, animate a photo. Pick one, write a sentence, press the button. The right model is chosen for you; model choice lives under Advanced for the people who want it.',
  },
  {
    complaint: 'A low keeper rate burns money at premium prices.',
    fix: 'Draft then final. Iterate on a fast, cheap pass, then promote the one you liked to the premium model with one click, reusing the exact prompt and settings. You pay the high rate once, on the shot you already know works.',
  },
  {
    complaint: 'Silent failures and rate limits leave you staring at a spinner.',
    fix: 'Every job has a visible state at all times: queued, generating, done, failed, blocked, timed out or duplicate. Status reads retry with backoff, and a scheduled sweep settles anything you stopped watching — so closing the tab still ends in a refund rather than limbo.',
  },
  {
    complaint: 'Getting your money back is deliberately difficult.',
    fix: 'One button in your wallet files the request and opens a prefilled email to support with your account details already in it. No retention offers, no multi-step flow, no phone call.',
  },
  {
    complaint: 'You do not find out what it cost until after it ran.',
    fix: 'The Generate button says "Generate: 40 credits" before you touch it. The server recomputes that price independently and refuses the job if the two disagree, so you are never charged a number you did not see.',
  },
];

export default function PromisesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-10">
      <h1 className="text-3xl font-extrabold sm:text-4xl">
        Ten complaints. <span className="jv-glow-pink text-[var(--color-pink)]">Ten fixes.</span>
      </h1>
      <p className="mt-3 text-[var(--color-muted)]">
        This product is a list of grievances about AI generation studios, each one turned into a
        feature. Here they are, in full, with nothing softened.
      </p>

      <ol className="mt-8 space-y-4">
        {PROMISES.map((promise, index) => (
          <li key={promise.complaint} className="jv-card p-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-yellow)]">
              Complaint {index + 1}
            </p>
            <p className="font-semibold text-[var(--color-muted)] line-through decoration-[var(--color-pink)]/60">
              {promise.complaint}
            </p>
            <p className="mt-3 text-sm leading-relaxed">{promise.fix}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/studio" className="jv-btn jv-btn-primary">
          Try it with free credits
        </Link>
        <Link href="/stats" className="jv-btn jv-btn-ghost">
          See the live numbers
        </Link>
      </div>
    </div>
  );
}
