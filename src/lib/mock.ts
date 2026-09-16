/**
 * HF_MOCK=1 provider double.
 *
 * Tests and demos exercise the identical pipeline -- submit, poll, download,
 * hash, store, refund -- without spending a cent at the provider. Outcomes are
 * forced through markers in the prompt so a test can demand a failure, a
 * moderation block, a timeout, or a duplicate on purpose.
 *
 * State lives entirely inside the request id, so this survives the stateless
 * serverless model with no store behind it.
 */
import type { StatusResult, SubmitResult, ProviderStatus } from './higgsfield';
import { seedFromString } from './mock-image';

export type ForcedOutcome = 'ok' | 'fail' | 'nsfw' | 'timeout' | 'duplicate' | 'cancel';

const MARKER = /\[\[force:(ok|fail|nsfw|timeout|duplicate|cancel)\]\]/i;

export function readForcedOutcome(prompt: string): ForcedOutcome {
  const marker = MARKER.exec(prompt);
  if (marker) return marker[1].toLowerCase() as ForcedOutcome;
  const globalForce = process.env.HF_MOCK_FORCE;
  if (globalForce && ['ok', 'fail', 'nsfw', 'timeout', 'duplicate', 'cancel'].includes(globalForce)) {
    return globalForce as ForcedOutcome;
  }
  return 'ok';
}

export function stripMarkers(prompt: string): string {
  return prompt.replace(new RegExp(MARKER, 'gi'), '').replace(/\s+/g, ' ').trim();
}

function mockDelayMs(): number {
  const raw = Number(process.env.HF_MOCK_DELAY_MS ?? '0');
  return Number.isFinite(raw) ? raw : 0;
}

export function mockSubmit(endpoint: string, body: Record<string, unknown>): SubmitResult {
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const outcome = readForcedOutcome(prompt);
  // A forced duplicate pins the seed to the prompt, so the next run of the same
  // prompt renders the identical image. Everything else gets a fresh seed.
  const seed =
    outcome === 'duplicate'
      ? seedFromString(stripMarkers(prompt))
      : Math.floor(Math.random() * 0xffffffff);
  const kind = endpoint.includes('video') ? 'video' : 'image';
  const requestId = `mock-${outcome}-${kind}-${seed}-${Date.now()}`;
  const base = 'https://mock.jellyvid.local';
  return {
    requestId,
    status: 'queued',
    statusUrl: `${base}/requests/${requestId}/status`,
    cancelUrl: `${base}/requests/${requestId}/cancel`,
  };
}

interface ParsedMockId {
  outcome: ForcedOutcome;
  kind: 'image' | 'video';
  seed: number;
  createdAt: number;
}

export function parseMockRequestId(requestId: string): ParsedMockId | null {
  const parts = requestId.split('-');
  if (parts.length !== 5 || parts[0] !== 'mock') return null;
  return {
    outcome: parts[1] as ForcedOutcome,
    kind: parts[2] as 'image' | 'video',
    seed: Number(parts[3]),
    createdAt: Number(parts[4]),
  };
}

export function mockStatus(statusUrl: string): StatusResult {
  const match = /\/requests\/([^/]+)\/status/.exec(statusUrl);
  const requestId = match ? match[1] : '';
  const parsed = parseMockRequestId(requestId);
  if (!parsed) {
    return { requestId, status: 'failed', error: 'unknown mock request', raw: {} };
  }

  // A forced timeout never leaves in_progress; the reconciler is what ends it.
  if (parsed.outcome === 'timeout') {
    return { requestId, status: 'in_progress', raw: { status: 'in_progress' } };
  }
  if (Date.now() - parsed.createdAt < mockDelayMs()) {
    return { requestId, status: 'in_progress', raw: { status: 'in_progress' } };
  }

  const terminal: Record<Exclude<ForcedOutcome, 'timeout'>, ProviderStatus> = {
    ok: 'completed',
    duplicate: 'completed',
    fail: 'failed',
    nsfw: 'nsfw',
    cancel: 'canceled',
  };
  const status = terminal[parsed.outcome as Exclude<ForcedOutcome, 'timeout'>] ?? 'completed';

  if (status !== 'completed') {
    return {
      requestId,
      status,
      error:
        status === 'nsfw'
          ? 'Content policy: the prompt was read as unsafe.'
          : 'Generation failed inside the model.',
      raw: { status },
    };
  }

  const outputUrl = `/api/mock/media/${parsed.seed}.png`;
  return {
    requestId,
    status: 'completed',
    outputUrl,
    raw: parsed.kind === 'video' ? { video: { url: outputUrl } } : { images: [{ url: outputUrl }] },
  };
}

export function mockCancel(cancelUrl: string): boolean {
  const match = /\/requests\/([^/]+)\/cancel/.exec(cancelUrl);
  const parsed = match ? parseMockRequestId(match[1]) : null;
  // Mirrors the real API: cancelling only works while the job is still queued.
  return parsed !== null && Date.now() - parsed.createdAt < 2_000;
}
