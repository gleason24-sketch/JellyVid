# Higgsfield API notes

Everything here was read from `docs.higgsfield.ai` and then **probed against the
live account** whose key is in `HIGGSFIELD_API_KEY`. Nothing is recalled from
memory. Where documentation and the account disagree, the account wins and the
disagreement is recorded.

Sources read: `/docs/llms.txt`, `authentication`, `quickstart`,
`how-to/introduction`, `concepts/requests`, `concepts/polling`,
`concepts/file-uploads`, `concepts/errors`, `concepts/billing-and-retention`,
`api-reference/*`, `models`, `models/{video,image}-generation`, and the
per-model and per-workflow pages listed below. `/docs/openapi.json` was read as
a cross-check only — the docs state it is supplementary, and probing confirmed
it lists routes this account cannot reach.

## Base URL and authentication

```
Base URL: https://api.higgsfield.ai
Header:   Authorization: Key ${HF_API_KEY_ID}:${HF_API_KEY_SECRET}
```

The console issues one string of the form `keyId:keySecret`, which is exactly
what the Netlify variable `HIGGSFIELD_API_KEY` holds. `src/lib/env.ts` splits it
on the first colon and also accepts the two values separately.

Legacy `hf-api-key` / `hf-secret` headers still work; new integrations should
not use them. Credentials are server-side only — `tests/secret-leak.test.ts`
greps the built client bundle to prove they never ship.

## Request lifecycle

Generation is asynchronous:

1. `POST` the model endpoint with JSON parameters.
2. Store `request_id` from the response.
3. Poll `status_url` (or use a webhook) until terminal.
4. Download the output.

The submission response is:

```json
{
  "status": "queued",
  "request_id": "...",
  "status_url": "https://api.higgsfield.ai/requests/{id}/status",
  "cancel_url": "https://api.higgsfield.ai/requests/{id}/cancel"
}
```

Use the returned URLs rather than rebuilding them — `src/lib/higgsfield.ts` does.

| Status        | Terminal | Meaning                                         |
| ------------- | :------: | ----------------------------------------------- |
| `queued`      |    no    | Waiting to start; still cancellable.            |
| `in_progress` |    no    | Running; no longer cancellable.                 |
| `completed`   |   yes    | Output URLs present.                            |
| `failed`      |   yes    | Generation failed; response may include `error`.|
| `nsfw`        |   yes    | Rejected by content moderation.                 |
| `canceled`    |   yes    | Cancelled before processing started.            |

There is no `timeout` or `duplicate` provider status — those two are **ours**,
added so an abandoned job and a paid re-roll that returns what you already have
both become refundable outcomes rather than silence.

### Output shapes

Depends on the model's output type:

```json
{ "images": [{ "url": "..." }] }        // image
{ "video":  { "url": "..." } }          // video
{ "audio":  { "url": "..." }, "audios": [{ "url": "..." }] }  // audio
```

`extractOutput()` in `src/lib/higgsfield.ts` handles all of these plus bare
string arrays, and is unit-tested against each shape.

### Polling

Documented strategy, implemented in `advanceJob()` and `scripts/smoke-live.mjs`:
start at 2s, ease out by ×1.5 to a 10s ceiling, add jitter, stop on any terminal
status, and impose an application-level timeout.

Retry rules (from `concepts/errors`):

| Response                    | Action                        |
| --------------------------- | ----------------------------- |
| 200, non-terminal status    | keep polling with backoff     |
| 401                         | stop, fix credentials         |
| 404                         | stop, wrong id or account     |
| 5xx / network               | retry with exponential backoff|

**Submissions are never retried automatically.** The docs are explicit that
submissions take no idempotency key, so retrying after an ambiguous timeout can
bill twice. `submit()` is called with `retries: 0`; only `getStatus()` retries.

### Errors

FastAPI envelope: `{"detail": "..."}`. Mapped in `classify()`:

| Status | Meaning                              | Our code                        |
| ------ | ------------------------------------ | ------------------------------- |
| 400    | bad params, or concurrency reached   | `invalid_request` / `rate_limited` |
| 401    | bad credentials                      | `unauthorized`                  |
| 403    | insufficient credits                 | `insufficient_provider_credits` |
| 404    | model or request not found           | `model_unavailable`             |
| 422    | body validation failed               | `invalid_request`               |
| 423    | model temporarily blocked            | `model_unavailable`             |
| 500    | server error                         | `server_error` (retryable)      |
| 503    | model disabled or not ready          | `model_unavailable`             |

Failed and NSFW requests are **not charged by Higgsfield**, and JellyVid refunds
the user regardless — so a block is free at both layers.

Every response carries `X-Correlation-ID`; it is captured on `HiggsfieldError`.

### Retention

Output URLs are retained **at least seven days**. A share link that dies in a
week is not a share link, so every completed output is mirrored into our own
store and served from `/api/media/[key]` (`src/lib/storage.ts`).

## Verified endpoints

Probed on 2026-09-16 with the production key. A `403 not_enough_credits` proves
the route resolved and the credentials authenticated; `404 model_not_found`
proves the model is not available to this account.

### Available — images

| Endpoint                          | Probe | In catalogue as          |
| --------------------------------- | ----- | ------------------------ |
| `/higgsfield-ai/soul/standard`     | 403   | `soul-draft` (5 cr)      |
| `/higgsfield-ai/soul/v2/standard`  | 403   | `soul-2-final` (15 cr)   |
| `/recraft/v4.1/pro/text-to-image`  | 403   | `recraft-final` (15 cr)  |
| `/marketing-studio/image`          | 403   | `marketing-studio-final` |
| `/xai/grok-imagine-image-2.0`      | 403   | not wired yet            |

### Available — video

| Endpoint                                 | Probe | In catalogue as             |
| ---------------------------------------- | ----- | --------------------------- |
| `/bytedance/seedance-2.0/text-to-video`   | 403   | `seedance-2-draft` (40 cr)  |
| `/bytedance/seedance-2.5/text-to-video`   | 403   | `seedance-25-final` (120 cr)|
| `/bytedance/seedance-2.5/reference-to-video` | 403 | `seedance-25-ref-final` — **face inputs** |
| `/bytedance/seedance-2.0/reference-to-video` | 403 | `seedance-2-ref-draft` — **face inputs**  |
| `/bytedance/seedance-2.0/image-to-video`  | 403   | `seedance-2-i2v-draft`      |
| `/bytedance/seedance-2.5/image-to-video`  | 403   | `seedance-25-i2v-final`     |
| `/kling-video/v3.0/std/text-to-video`     | 403   | `kling-3-final`             |
| `/alibaba/wan-3.0/text-to-video`          | 403   | `wan-3-final`               |
| `/bytedance/seedance-2.5/video-edit`       | 403   | not wired yet               |
| `/higgsfield-ai/soul/character`           | 403   | not wired yet (image, face) |
| `/higgsfield-ai/soul/reference`           | 403   | not wired yet (image, face) |
| `/kling-video/v3.0/std/image-to-video`    | 403   | not wired yet               |
| `/alibaba/wan-3.0/image-to-video`         | 403   | not wired yet               |

### NOT available to this account

| Endpoint                                | Probe | Note                                    |
| --------------------------------------- | ----- | --------------------------------------- |
| `/nano-banana`                           | 404   | listed in openapi.json; not reachable   |
| `/bytedance/seedance/v1/lite/text-to-video` | 404 | legacy openapi entry; not reachable    |

This is why `openapi.json` is treated as a cross-check and not as the catalogue:
it lists routes the account cannot use. `src/lib/models.ts` contains only
endpoints that probed reachable.

### Free auxiliary endpoints (verified 200)

- `GET /v1/text2image/soul-styles/v2` — SOUL style list; returns
  `{id, name, description, preview_url}`. Wired as `listSoulStyles()`.
- `POST /files/generate-upload-url` — presigned upload; returns `public_url`,
  `upload_url`, `content_type`, `upload_headers`. Verified end to end.

## Model parameters in use

Read from each model's own workflow page.

**`bytedance/seedance-2.5/text-to-video`** — `prompt` (required),
`resolution` (`480p` | `720p`), `duration` 4–30, `aspect_ratio`
(`16:9|4:3|1:1|3:4|9:16|21:9`), `generate_audio`, `output_format` (`mp4`|`mov`).
No media inputs; automatic duration (`-1`) unsupported.

**`bytedance/seedance-2.5/reference-to-video`** — this is the face-input path,
and the reason the product exists in this shape. `image_urls` accepts 1–30
public reference image URLs (`video_urls` and `audio_urls` also exist, 1–10
each); at least one reference of some kind is required. Also `prompt`,
`resolution` (`480p`|`720p`), `duration` 4–30, `generate_audio`,
`output_format`, and — the docs are explicit about this — an **explicit
`aspect_ratio`**. It does not take `image_url`; sending one is a 422.
`asset://` references are not accepted.

**`bytedance/seedance-2.5/image-to-video`** — `image_url` (required, public
URL), optional `end_image_url`, `prompt`, `resolution`, `duration` 4–30,
`generate_audio`, `output_format`. Framing follows the input image, so no
`aspect_ratio`. `asset://` references are not accepted.

**`bytedance/seedance-2.0/text-to-video`** — as 2.5 but `resolution` also allows
`1080p` and `4k`, and `duration` is 4–15.

**`higgsfield-ai/soul/v2/standard`** — `prompt` (required), `aspect_ratio`
(`9:16|16:9|4:3|3:4|1:1|2:3|3:2`), `resolution` (`720p`|`1080p`), `style_id`
(UUID from the styles endpoint), `batch_size` (1 or 4), `enhance_prompt`,
`seed` 1–1000000.

## File uploads

1. `POST /files/generate-upload-url` with `{"content_type": "image/jpeg"}`.
2. `PUT` the bytes to `upload_url` with **every** header in `upload_headers`
   (including `x-amz-tagging`). Send no Higgsfield credentials to that host.
3. Pass `public_url` as `image_url` / `video_url` / `audio_url`.

The presigned URL expires after one hour. Accepted types: `image/jpeg`,
`image/jpg`, `image/png`, `image/webp`, `image/gif`, `audio/wav`,
`audio/x-wav`, `video/mp4`. `/api/upload` proxies this so the browser never
holds a credential.

## Known gaps, stated rather than papered over

- **Video perceptual hashing.** The duplicate-refund check decodes a still and
  runs a DCT hash on it. There is no pure-JS mp4 decoder in this build and no
  ffmpeg on the serverless target, so **video outputs are deduplicated by
  SHA-256 of the bytes only** — that catches a byte-identical repeat but not a
  perceptually near-identical one. Images get the full perceptual check. The
  honest fix is a frame extraction step (an ffmpeg layer, or a provider-supplied
  thumbnail); until then, this limitation is the reason video re-rolls can slip
  through where image re-rolls cannot.
- **Webhooks are not wired.** The API supports them; JellyVid polls and runs a
  five-minute reconciliation sweep instead, which is sufficient at this scale
  and has one fewer public endpoint to secure. Worth revisiting under load.
- **Credit costs are ours, not the provider's.** The numbers in
  `src/lib/models.ts` are JellyVid's retail prices. They are *not* derived from
  Higgsfield's per-model cost, which the docs do not publish per endpoint. They
  must be calibrated against real console billing before charging real money.
- **`grok-imagine-image-2.0` and the Kling/Wan image-to-video routes** probed
  reachable but are not in the catalogue yet.

## Account status at time of writing

The credentials in `HIGGSFIELD_API_KEY` **authenticate correctly** — a request
for an unknown id returns `404`, not `401` — but the account has **no API
credits**, so every generation endpoint answers:

```
HTTP 403  {"detail":"not_enough_credits"}
```

This is an account balance, not a code problem. API credits are bought at
`console.higgsfield.ai` and are **separate from a higgsfield.ai consumer
subscription** — a Plus plan with credits on the website does not fund API
calls. Until credits are loaded:

- `npm run smoke:live` fails with a message naming exactly this cause.
- The deployed app runs in `HF_MOCK=1`, where the full pipeline works on local
  fixtures at zero cost.

Load credits, drop `HF_MOCK` from the Netlify environment, and the same code
path goes live with no edits.
