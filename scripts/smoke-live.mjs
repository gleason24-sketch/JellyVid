/**
 * One real image generation and one real video generation against the live
 * Higgsfield API, end to end, with no mocking. This is the only script in the
 * repo that spends money, so it is never part of `npm test`.
 *
 *   npm run smoke:live            # image + video
 *   npm run smoke:live -- --image # image only (cheaper)
 *
 * It exits non-zero unless every requested generation returns a stored URL.
 */
import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const BASE = 'https://api.higgsfield.ai';
const raw = process.env.HIGGSFIELD_API_KEY ?? '';
const keyId = process.env.HF_API_KEY_ID ?? raw.slice(0, raw.indexOf(':'));
const keySecret = process.env.HF_API_KEY_SECRET ?? raw.slice(raw.indexOf(':') + 1);

if (!keyId || !keySecret) {
  console.error('Set HIGGSFIELD_API_KEY ("keyId:keySecret") or HF_API_KEY_ID + HF_API_KEY_SECRET.');
  process.exit(2);
}

const auth = { Authorization: `Key ${keyId}:${keySecret}`, 'Content-Type': 'application/json' };
const args = process.argv.slice(2);
const only = args.find((arg) => arg === '--image' || arg === '--video');

const CASES = [
  {
    kind: 'image',
    endpoint: '/higgsfield-ai/soul/standard',
    body: {
      prompt: 'a translucent neon-pink jellyfish drifting in dark water, editorial product photography',
      aspect_ratio: '1:1',
      batch_size: 1,
    },
    timeoutMs: 180_000,
  },
  {
    kind: 'video',
    endpoint: '/bytedance/seedance-2.0/text-to-video',
    body: {
      prompt: 'a translucent neon-pink jellyfish drifting through dark water, slow cinematic push in',
      resolution: '480p',
      duration: 5,
      aspect_ratio: '16:9',
      generate_audio: false,
    },
    timeoutMs: 600_000,
  },
].filter((testCase) => !only || only === `--${testCase.kind}`);

function outputUrl(payload) {
  const fromArray = (value) =>
    Array.isArray(value) && value.length
      ? typeof value[0] === 'string'
        ? value[0]
        : value[0]?.url
      : undefined;
  return (
    payload?.video?.url ??
    fromArray(payload?.videos) ??
    fromArray(payload?.images) ??
    payload?.image?.url ??
    payload?.audio?.url
  );
}

async function run({ kind, endpoint, body, timeoutMs }) {
  process.stdout.write(`\n[${kind}] POST ${endpoint}\n`);
  const submitted = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(body),
  });
  const submitText = await submitted.text();

  if (!submitted.ok) {
    let detail = submitText;
    try {
      detail = JSON.parse(submitText).detail ?? submitText;
    } catch {
      /* raw body */
    }
    if (submitted.status === 403 && String(detail).includes('not_enough_credits')) {
      throw new Error(
        'not_enough_credits: this API key authenticates but the Higgsfield account has no API ' +
          'credits. Load credits at console.higgsfield.ai and re-run.',
      );
    }
    throw new Error(`submit failed: HTTP ${submitted.status} ${detail}`);
  }

  const { request_id: requestId, status_url: statusUrl } = JSON.parse(submitText);
  console.log(`[${kind}] request_id=${requestId}`);

  // Two seconds, easing out to ten, exactly as the polling guide recommends.
  const deadline = Date.now() + timeoutMs;
  let delay = 2_000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 400));
    delay = Math.min(delay * 1.5, 10_000);

    const response = await fetch(statusUrl, { headers: auth });
    if (!response.ok) {
      if (response.status >= 500) continue;
      throw new Error(`status failed: HTTP ${response.status} ${await response.text()}`);
    }
    const result = await response.json();
    process.stdout.write(`[${kind}] ${result.status}\n`);

    if (['completed', 'failed', 'nsfw', 'canceled'].includes(result.status)) {
      if (result.status !== 'completed') {
        throw new Error(`terminal status ${result.status}: ${result.error ?? 'no error given'}`);
      }
      const url = outputUrl(result);
      if (!url) throw new Error('completed but returned no output URL');

      // Prove the URL actually serves bytes, not just that it exists.
      const head = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
      if (!head.ok) throw new Error(`output URL not retrievable: HTTP ${head.status}`);
      const bytes = (await head.arrayBuffer()).byteLength;

      console.log(`[${kind}] OK ${url}`);
      console.log(`[${kind}] retrieved ${bytes} bytes`);
      return url;
    }
  }
  throw new Error(`timed out after ${timeoutMs}ms`);
}

let failed = false;
for (const testCase of CASES) {
  try {
    await run(testCase);
  } catch (error) {
    failed = true;
    console.error(`[${testCase.kind}] FAILED: ${error.message}`);
  }
}

console.log(failed ? '\nsmoke:live FAILED' : '\nsmoke:live PASSED');
process.exit(failed ? 1 : 0);
