# JellyVid

**AI video that doesn't play games with your money.**

Credits that never expire. Refunds you don't have to ask for. Prices you see
before you click.

JellyVid is an image and video studio built on the Higgsfield API. Its entire
feature set is a list of documented complaints about AI generation studios, each
one turned into a guarantee that is enforced in code rather than promised in
copy. See [`CLAUDE.md`](CLAUDE.md) for the complaint → fix map and
[`DECISIONS.md`](DECISIONS.md) for why it is built this way.

## The governing rule

A promise about money is enforced in the database or it is not a promise.

- Credits cannot expire because **no expiry column exists**.
- A spend is a single conditional `UPDATE` that fails closed, so a wallet cannot
  go negative or be double-debited.
- A refund happens in the **same statement** that records the failure, guarded by
  a partial unique index, so it cannot be applied twice or forgotten.

`tests/database.test.ts` proves each of these against the real database,
including firing five concurrent 40-credit jobs at a 100-credit wallet and
asserting exactly two succeed.

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in Supabase + Higgsfield values
npm run dev
```

Set `HF_MOCK=1` to run the entire pipeline — submit, poll, download, hash,
mirror, refund — against local fixtures at zero cost:

```bash
HF_MOCK=1 npm run dev
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint + `tsc --noEmit`, zero warnings tolerated |
| `npm test` | Unit, database-invariant and secret-leak tests |
| `npm run e2e` | Playwright funnel on a phone viewport, `HF_MOCK=1` |
| `npm run smoke:live` | **Spends real money.** One real image and one real video |

## Architecture

```
src/lib/          models.ts (catalogue)  higgsfield.ts (API client)
                  jobs.ts (pipeline)     phash.ts (duplicate detection)
                  db.ts (RPC layer)      session.ts  pricing.ts  moderation.ts
src/app/api/      generate  jobs/[id]  upload  rewrite  ledger  payout
                  checkout  stripe/webhook  reconcile  stats  media/[key]
supabase/         migrations — schema, and every money invariant
tests/            unit + database + secret-leak
e2e/              the full funnel
reference/        the vendored higgsfield-ai/higgsfield training framework
```

### Security

The app holds **no Supabase service-role key**. Tables are RLS-locked with no
policies, so the publishable key reads nothing; all access goes through
`SECURITY DEFINER` functions requiring a server-only shared secret. Provider
credentials never leave the server — `tests/secret-leak.test.ts` greps the real
built client bundle for secret names, live values and key-shaped patterns.

## Status

Everything above is built, deployed and tested. Two things gate real
generations, both listed in [`TODO.md`](TODO.md):

1. **The Higgsfield account has no API credits.** The key authenticates
   correctly, but every generation endpoint returns `403 not_enough_credits`.
   API credits are bought at `console.higgsfield.ai` and are separate from a
   higgsfield.ai consumer subscription.
2. **Credit prices are not yet calibrated** against real provider billing.

Until credits are loaded the app runs in `HF_MOCK=1`. Loading credits and
removing that variable switches the same code path to live with no edits.

## Licence

The vendored `reference/higgsfield-oss/` retains its original licence and
notices. It is a PyTorch distributed-training framework that shares the
Higgsfield name and is unrelated to the video API this app uses.
