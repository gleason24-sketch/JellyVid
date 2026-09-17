# TODO

Live checklist. A box is only ticked when the command behind it has been run and
passed in this repo.

## Complaint → fix map

- [x] 1. Credits never expire — no expiry column exists; `never_expires` rides on every wallet payload
- [x] 2. One flat rate, no subscriptions, no pre-checked boxes, no timers
- [x] 3. Automatic refund ledger with a Refunds tab
- [x] 4. pHash duplicate detection (≤5 hamming) with automatic refund
- [x] 5. Moderation blocks cost $0, give a plain reason, offer one-click safe rewrite
- [x] 6. Task-first home: exactly four cards, model hidden under Advanced
- [x] 7. Draft then final, with one-click upgrade of the keeper
- [x] 8. Server-side queue, retries with backoff, visible state for every job
- [x] 9. One-button refund of unused balance, prefilled to support
- [x] 10. Exact credit cost on the Generate button, re-verified server-side

Every row has a test named after it in `tests/complaint-fixes.test.ts`.

## The hook

- [x] Seedance 2.5 / 2.0 reference-to-video wired — real face inputs, verified
      reachable on this account
- [x] Cast flow: upload 1–3 photos, consent gate, generate
- [x] Eight one-tap scene presets, so no prompt has to be written
- [x] Draft→final carries the same reference set forward
- [x] Public gallery at `/gallery`, surfaced on the landing page
- [ ] Soul character / Soul reference (image-side face models) not wired yet
- [ ] Seedance 2.5 video-edit and video-extend not wired yet

## Build

- [x] Higgsfield docs read; endpoints verified against the live account (`docs/HIGGSFIELD_NOTES.md`)
- [x] Typed client with timeouts, bounded retries, typed errors, no retry on submit
- [x] Model catalogue sourced from docs + probing; unreachable routes excluded
- [x] `HF_MOCK=1` fixture mode covering the whole pipeline
- [x] Postgres schema with RLS on and money invariants enforced in SQL
- [x] Anonymous-first sessions with recovery codes
- [x] Landing, studio, wallet, pricing, promises, share, stats pages
- [x] Mobile-first dark UI with neon pink / baby blue / yellow accents
- [x] Brand assets resized from 5 MB of 3000px PNGs to ~200 KB of web sizes
- [x] Netlify scheduled function for job reconciliation
- [x] Stripe Checkout + signed, idempotent webhook (gated behind keys)

## Verification

- [x] `npm run build` — passes
- [x] `npm run lint` — passes (ESLint + `tsc --noEmit`, zero warnings)
- [x] `npm test` — 60 passing (unit, database invariants, secret-leak)
- [x] `npm run e2e` — 17 passing on a phone viewport under `HF_MOCK=1`,
      including the full cast flow with a real photo upload
- [x] Secret-leak test greps the real built client bundle
- [x] `/stats` renders live counts from the database
- [ ] `npm run smoke:live` — **blocked**: the API key authenticates but the
      Higgsfield account has no API credits (`403 not_enough_credits`). The
      script is written and correctly diagnoses this. Load credits at
      console.higgsfield.ai and re-run.

## Launch blockers

- [ ] **Load Higgsfield API credits.** Nothing generates for real until this is
      done. API credits are separate from a higgsfield.ai consumer subscription.
- [ ] **Calibrate credit prices against real provider billing.** The numbers in
      `src/lib/models.ts` are retail prices chosen by us, not derived from
      Higgsfield's per-endpoint cost. Do not charge real money until a real
      generation's cost is known.
- [ ] **Set a spend cap in the Higgsfield console** so a runaway loop cannot
      drain the account.
- [ ] Add `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to enable purchases, and
      run one test-mode purchase end to end.
- [ ] Point `jellyvid.com` at the Netlify site and set `NEXT_PUBLIC_SITE_URL`.

## Known gaps

- [ ] Video duplicate detection is SHA-256 only; perceptual hashing needs a
      frame extraction step (ffmpeg layer or provider thumbnail). Images are
      fully covered.
- [ ] Webhooks not wired; polling + a five-minute sweep is used instead.
- [ ] `grok-imagine-image-2.0` and the Kling/Wan image-to-video routes probed
      reachable but are not in the catalogue yet.
- [ ] Lighthouse has not been run against the deployed site; the landing page is
      static with ~111 KB first-load JS and no render-blocking third parties.
- [ ] Refund payouts are filed as requests and handled by a human; there is no
      automated card refund.
