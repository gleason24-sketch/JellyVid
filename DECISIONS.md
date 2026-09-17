# Decisions

Every deviation from the original brief, and every non-obvious choice, with the
reason. Newest first within each section.

## Architecture

### No Supabase service-role key; access via SECURITY DEFINER RPCs

**Brief said:** Supabase with auth, Postgres, Storage, RLS on.

**What happened:** The tooling available in this environment exposes Supabase
*publishable* keys only — there is no path to a service-role key or a database
password. A publishable key plus permissive RLS policies would have meant
wallet and ledger rows readable by anyone who read the JS bundle.

**Decision:** Tables are RLS-locked with **no policies at all**, so the anon key
can read nothing. Every operation is a `SECURITY DEFINER` function that requires
`JELLYVID_DB_SECRET`, which exists only in server environment variables.

**Why this is better than the default, not just a workaround:** it forced the
credit arithmetic into the database. A spend is one conditional `UPDATE` that
fails closed; a refund is protected by a partial unique index. Double-spends and
double-refunds are impossible by construction rather than by careful handler
code. `tests/database.test.ts` fires five concurrent 40-credit jobs at a
100-credit wallet and asserts exactly two succeed.

**Cost:** more SQL, and a shared secret to rotate (`jv_set_app_secret`).

### Anonymous-first sessions instead of magic-link auth

**Brief said:** Supabase auth, magic link + Google.

**Decision:** First generation mints a real account and wallet behind an
HMAC-signed httpOnly cookie. Email is optional and only moves the wallet
between devices.

**Reason:** the mission is a first generation in under 60 seconds. A magic link
is an inbox round trip in the middle of that — and Supabase's built-in email has
low sending limits that would throttle exactly the launch traffic we want.

**Cross-device:** claiming an email issues a recovery code (shown once, stored
hashed). Email + code restores the wallet. No SMTP dependency, which means no
silent failure mode where a user's credits are stranded behind an undelivered
email. If SMTP is added later, the magic link becomes an additional path, not a
replacement — the recovery code still works.

### Netlify Blobs for output mirroring, not Supabase Storage

Provider URLs expire in about seven days. Supabase Storage writes would need a
policy permitting the anon key to upload, which reopens the hole the RPC design
just closed. Netlify Blobs is server-side only, needs no key, and is native to
the deploy target. `src/lib/storage.ts` falls back to a temp directory locally
and under test.

### Polling plus a scheduled sweep, not webhooks

The API supports webhooks. We poll (2s easing to 10s, as documented) and run a
five-minute reconciliation sweep. Rationale: one fewer public endpoint to
authenticate, and the sweep is needed regardless — it is what makes the refund
promise hold when someone closes the tab mid-generation, which a webhook alone
would not. Worth revisiting under real load.

### `timeout` and `duplicate` are our statuses, not the provider's

Higgsfield's terminal states are `completed`, `failed`, `nsfw`, `canceled`.
JellyVid adds two more so that an abandoned job and a paid re-roll returning
what you already have both become *refundable outcomes* rather than silence.

## Product

### Credit costs are retail prices, not provider costs

`src/lib/models.ts` prices a draft video at 40 credits and a final at 120. These
are JellyVid's numbers. Higgsfield does not publish per-endpoint costs in its
docs, so **these are not yet calibrated against real billing** and must be
before charging real money. Flagged in `TODO.md` as a launch blocker.

### 1 credit = 1 cent, with no volume discount

The brief said "one flat price table". A tiered discount is still a pricing
puzzle, and puzzles are what complaint #2 is about. Every pack is the same rate,
so there is no optimal moment to buy and nothing to feel clever or foolish
about. `everyPackIsTheSameRate()` is asserted in the test suite, so the promise
breaks the build if someone edits it away.

### The rewriter is deterministic and local, not an LLM

Complaint #5 needs a one-click "Rewrite safely". An LLM call would need another
API key and would add a failure mode to a path the user only reaches when
something has *already* gone wrong. A rules table handles the common cases,
costs nothing, cannot time out, and states exactly what it changed.
`rewriteWithLlm` behind `JELLYVID_LLM_API_KEY` is the documented upgrade path.

### Video deduplication is weaker than image deduplication

The pHash check needs a decodable still. There is no pure-JS mp4 decoder here
and no ffmpeg on the serverless target, so video outputs dedupe on SHA-256 of
the bytes only — a byte-identical repeat is caught, a perceptually
near-identical one is not. Images get the full perceptual check. Stated plainly
rather than implied, in `docs/HIGGSFIELD_NOTES.md` and in `TODO.md`.

### Stripe is built but gated

The full flow exists — Checkout session, signed webhook, idempotent crediting
via a unique `external_ref`. With no `STRIPE_SECRET_KEY` the pricing page says
card payments are off, in plain words. Showing a Buy button that fails at the
last step would be exactly the kind of thing this product exists to oppose.

### The vendored repo at the root was not the API SDK

The repository supplied as "the open source repo of Higgsfield" is
`higgsfield-ai/higgsfield`, a **PyTorch distributed-training framework** — a
different project that shares the name. It has no bearing on the video API. It
is preserved under `reference/higgsfield-oss/` with its LICENSE and NOTICES
intact; its PyPI-publishing GitHub workflows were removed, as they referenced
another project's release secrets. The API integration was built from
`docs.higgsfield.ai` and live probing instead.

## Bugs found while building

### Session cookie was `Secure` based on `NODE_ENV`

A production build served over plain HTTP — local `next start`, a preview box,
the e2e suite — set a `Secure` cookie the client silently dropped, so **every
request minted a brand-new wallet**. Found by the e2e suite, whose balance
assertions could not be satisfied. Now derived from whether the configured site
URL is HTTPS.

### pgcrypto is not on the default search path

Supabase installs pgcrypto into the `extensions` schema. Functions pinned to
`search_path = public` (correct practice, to prevent hijacking) could not see
`digest()`. Fixed by pinning to `public, extensions` — still explicit, still
safe. Migration `0003`.

### `jv_wallet_json` had no secret parameter

It is an internal serialiser, so route handlers could not reach it through the
guarded RPC path. Added `jv_wallet_get` as its public face. Migration `0004`.

## Testing

### The e2e suite raises the signup rate limit rather than removing it

Production caps free-credit signups at 5 per IP per day. The whole suite shares
one loopback address. `JELLYVID_SIGNUPS_PER_IP_PER_DAY` was already
configuration, so the suite raises it instead of disabling the check — the
limiter still runs, exercising the same code path.

### Playwright uses the image's Chromium

The pinned `@playwright/test` wants a browser build the image does not carry.
`JELLYVID_CHROMIUM_PATH` points at the installed one. Unset, it falls back to a
normal `npx playwright install` browser.

### Static pages revalidate instead of being frozen at build

The landing and promises pages were `force-static`, which baked the demo banner
into the HTML at build time. Removing `HF_MOCK` would then leave a stale "Demo
mode" notice up until the next deploy — a page lying about what the product is
doing, which is the one failure mode this product cannot have. They now use
`revalidate = 300`: still statically served, but regenerated within five minutes
of a server-config change.

### Mobile nav drops the Pricing link below 380px

At 320px (original iPhone SE) the bar could not hold the wordmark, two text
links and the CTA, and overflowed by 42px. Pricing is hidden under 380px — it
stays one tap away in the footer, the wallet and the studio's Top up button.
Horizontal overflow is now 0px across iPhone SE, iPhone 13, Pixel 7 and iPad
Mini on all six pages.

## The pivot: faces first

### The product is now "put yourself in the movie"

The competition this is built for is judged on one thing: whether people
actually use it. That reframes the whole build.

The Higgsfield API has one capability its competitors do not — **Seedance 2.5
reference-to-video with real face inputs, available in the US**. That is the
most personal, most shareable thing the platform can do, and it is the only
thing here that cannot be rebuilt on another provider. So it became the hero:
upload a selfie, tap a scene, star in it.

The honest-money layer did not go away — it is still enforced in SQL and still
the reason to trust us with a card later. It is now the second thing you learn
about the product rather than the first.

### We do not compete with the open-source studio on model count

`wide-trace/open-higgsfield` is the reference implementation: 32 models behind
one prompt bar, per-model setting allow-lists, bring your own key. It is very
good at what it is — a power tool for someone who already has an API key.

Matching it model-for-model would be losing on their terms. The gap it leaves is
the person who has no key, has never written a prompt, and wants a video of
themselves. That person cannot use it at all. So JellyVid is hosted, needs no
key, grants free credits on first tap, and chooses the model for you.

### Scene presets, because "write a prompt" is the real drop-off

Eight curated scenes, each a full cinematic direction — camera move, lighting,
lens, grade — with a `{subject}` slot filled differently per task. One tap
produces an 80+ character directed shot. The textarea stays editable for anyone
who wants it. This is the difference between a tool and a thing your mother can
use.

### A public gallery, because proof of use is the judging criterion

Every shared output appears at `/gallery` and on the landing page. It is social
proof, it is the share loop's landing surface, and it is indexable. `jv_gallery`
is public and secret-free like `jv_share_get` and `jv_stats`, and returns only
what the maker explicitly published — never an identity.

### Five task cards, not four

The original brief said exactly four. The cast flow earned a fifth, featured
above the others. Five short cards with the model still chosen for you is not
the carnival complaint #6 is about; the test now asserts a ceiling of five and
that the hero is first, rather than an exact list of four.

## The visual rebuild

### Restraint with the accent is what separates a studio site from a landing page

The first design glowed pink on nearly every element — buttons, headings, card
borders, chips, the wordmark. That reads as cheap regardless of how good the
engineering underneath is. The category's best-looking work (Higgsfield's own
site included) is overwhelmingly black, white type and imagery, with the accent
touching a few percent of the pixels.

So: `--color-ink` is now pure black, `jv-card` (a glowing bordered box, used
everywhere) became `jv-panel` (a hairline surface, used rarely), and the pink
glow is reserved for a single element per screen — usually the one primary
button. Bands are separated by hairlines and background steps rather than by
stacking boxes inside boxes.

### A real typeface

There was no display face at all — everything was the system UI stack at
`font-extrabold`, which is why headings read as a SaaS template. Archivo is now
loaded through `next/font`, and `.jv-display` sets headings uppercase with tight
negative tracking and 0.92 line-height. That single change does most of the work.

### Media-first, and a mobile tab bar

The page is now built out of tiles rather than paragraphs: a horizontal scene
rail, a gallery grid, and far less prose. The phone gets a fixed bottom tab bar
with Create as the one accented control, because a generation tool lives on a
phone and a phone expects a thumb-reachable bar, not a hamburger.

### Scene tiles degrade into posters, not into holes

Each scene carries a `tone` — two colours standing in for its palette — and an
optional `previewUrl`. With a preview it plays the clip; without one it renders
as a poster in the scene's own colours with the name set large. Both states
share the same geometry, so dropping real previews in later changes no layout.
This is why the site does not look broken while the generation account has no
credits: the empty state was designed, not defaulted.

### The demo banner is one line

It was five lines above the fold, which pushed the actual product below it. A
disclaimer that buries what people came for is its own kind of dishonesty. It
is now a single line with a small chip, still non-dismissible.

### The demo reel: one synthetic face, eight films

The site had no real output on it anywhere, and nothing describes face inputs
as well as seeing one face carried through eight scenes. So the reel was
generated the way the product generates: a SOUL 2 portrait, then Seedance 2.5
reference-to-video for every scene preset (`generate_audio` off; clips are
muted on the page). The subject is synthetic — no real person's likeness.

It cost 137.5 consumer credits (32.5 for the 720p hero, 15 each for seven
480p scenes), authorised by the owner. Clips live in `public/reel/` (17 MB,
H.264) and are keyed by scene id, so regenerating with a different subject is
one manifest and `scripts/fetch-reel.mjs`.

Every tile paints its scene's colour poster first and the clip on top. If a
browser cannot decode the clip, the poster shows — never a black box. (This
sandbox's Chromium build has no H.264, which is exactly the case it covers.)

### Placeholder outputs never appear in the public gallery

While `HF_MOCK` is on, user-shared outputs are fixtures. Showing them in the
gallery as if they were real work would be the one lie this product cannot
tell, so under mock the gallery page and landing band render the reel instead.
The `/api/gallery` feed is unchanged (tests exercise the real DB path through
it), and once real generation is on, user posts take over with the reel as
seeds so the grid is never empty.
