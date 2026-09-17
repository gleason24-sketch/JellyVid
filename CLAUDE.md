# CLAUDE.md — JellyVid

## Mission

A production AI image/video studio on the Higgsfield API, built so a
non-technical creator goes from landing page to first generation in under 60
seconds. Every feature exists to fix a documented complaint about AI generation
studios. Optimise for activation and trust.

## The rule that governs this codebase

**A promise about money is enforced in the database or it is not a promise.**

Marketing copy can say credits never expire. What makes it true is that no
column exists to expire them. Copy can say refunds are automatic. What makes it
true is that the refund happens in the same SQL statement that records the
failure, protected by a unique index. Before adding any guarantee to the UI, ask
where it is enforced. If the answer is "in the handler, if we remember", it is
not done.

## Complaint → fix map (these are the product; do not cut any)

| # | Complaint | Fix | Enforced in |
|---|-----------|-----|-------------|
| 1 | Credits expire at renewal | No expiry column exists; wallet payload carries `never_expires: true` | `0001_init.sql`, `jv_wallet_json` |
| 2 | Shifting pricing, annual dark patterns | 1 credit = 1 cent in every pack; no subscriptions, no pre-checked boxes, no timers | `src/lib/pricing.ts` |
| 3 | Refunds ignore failed generations | Failed/blocked/timed-out/cancelled/duplicate refund automatically; Refunds tab in the wallet | `jv_job_finalize` |
| 4 | Paid re-rolls return the same image | 64-bit DCT pHash; ≤5 hamming on the same prompt ⇒ "Duplicate, refunded" | `src/lib/phash.ts`, `jv_find_duplicate` |
| 5 | False/opaque NSFW blocks | Blocks cost $0, carry a plain-English reason, and offer one-click "Rewrite safely" | `src/lib/moderation.ts` |
| 6 | Convoluted carnival UI | Exactly four task cards; model chosen for you, hidden under Advanced | `src/lib/models.ts`, `src/components/studio.tsx` |
| 7 | Low keeper rate burns money | Draft then final: cheap pass, then one-click upgrade of the keeper | `/api/jobs/[id]/upgrade` |
| 8 | Silent failures / rate limits | Every job has a visible state; status reads retry with backoff; a sweep settles abandoned jobs | `advanceJob`, `reconcilePending` |
| 9 | Hard to cancel or get money back | One button files the request and opens a prefilled support email | `/api/payout` |
| 10 | Cost surprise | Price is on the button; server recomputes it and refuses a mismatch | `createJob`, `studio.tsx` |

Each row has at least one test named after it in `tests/complaint-fixes.test.ts`.

## Stack

- Next.js 15 (App Router, TypeScript), Tailwind v4
- Supabase Postgres, RLS on, reached through SECURITY DEFINER RPCs
- Netlify (`@netlify/plugin-nextjs`), Netlify Blobs for output mirroring
- Stripe Checkout behind a flag; absent keys degrade to an honest message
- Vitest for unit + database tests, Playwright for e2e

Deviations from the original brief are recorded in `DECISIONS.md` with reasons.

## Security model

The app holds **no Supabase service-role key**. Every table is RLS-locked with
no policies, so the publishable key reads nothing. All access goes through
SECURITY DEFINER functions that require `JELLYVID_DB_SECRET`, held only in
server environment variables. `tests/database.test.ts` proves both halves: a
wrong secret is rejected, and the anon key returns no rows from any table.

Provider credentials are server-side only. `tests/secret-leak.test.ts` greps the
real built client bundle for secret names, live values, and key-shaped patterns.

## Higgsfield API rules

- Endpoints and parameters come from `docs.higgsfield.ai` and are then **probed
  against the live account**. See `docs/HIGGSFIELD_NOTES.md`. Never add a model
  ID from memory, and never keep one that probes `404`.
- Call the API only from server routes.
- **Never auto-retry a submission.** Submissions take no idempotency key, so a
  retry after an ambiguous timeout can bill twice. Status reads retry freely.
- Likeness inputs require the consent checkbox; the timestamp is stored on the
  job row. Obvious public figures are refused before any credit is spent.
- `HF_MOCK=1` serves the entire pipeline from local fixtures at zero cost.

## Working rules

- `TODO.md` is the live checklist. `DECISIONS.md` explains every non-obvious
  choice.
- Run `npm run lint && npm test && npm run e2e` before calling anything done.
- `npm run smoke:live` spends real money. It is never part of `npm test`.
- Never state that something passes without having run it.
