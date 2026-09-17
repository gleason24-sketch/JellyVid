/**
 * Typed Higgsfield API client. Server-only: credentials never cross to the browser.
 *
 * Endpoints and the request lifecycle come from docs.higgsfield.ai (see
 * docs/HIGGSFIELD_NOTES.md). There is no official JS SDK we depend on; this is
 * a small client with explicit timeouts, bounded retries, and typed errors.
 */
import 'server-only';
import { higgsfieldCredentials, isMockMode } from './env';
import { mockSubmit, mockStatus, mockCancel } from './mock';

export const HIGGSFIELD_BASE_URL = 'https://api.higgsfield.ai';

export type ProviderStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'nsfw'
  | 'canceled';

export const TERMINAL_STATUSES: ProviderStatus[] = ['completed', 'failed', 'nsfw', 'canceled'];

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as string[]).includes(status);
}

export interface SubmitResult {
  requestId: string;
  status: ProviderStatus;
  statusUrl: string;
  cancelUrl: string;
}

export interface StatusResult {
  requestId: string;
  status: ProviderStatus;
  /** First output URL of whichever media shape the model returns. */
  outputUrl?: string;
  posterUrl?: string;
  error?: string;
  raw: unknown;
}

export type HiggsfieldErrorCode =
  | 'not_configured'
  | 'unauthorized'
  | 'insufficient_provider_credits'
  | 'model_unavailable'
  | 'invalid_request'
  | 'rate_limited'
  | 'server_error'
  | 'network_error'
  | 'timeout';

export class HiggsfieldError extends Error {
  constructor(
    message: string,
    readonly code: HiggsfieldErrorCode,
    readonly status = 0,
    readonly retryable = false,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'HiggsfieldError';
  }

  /** Plain English, because the user reads this, not the status code. */
  get userMessage(): string {
    switch (this.code) {
      case 'insufficient_provider_credits':
        return 'Our generation account is out of credits. You were not charged.';
      case 'model_unavailable':
        return 'That model is temporarily unavailable. You were not charged.';
      case 'rate_limited':
        return 'Too many generations at once. You were not charged — try again in a moment.';
      case 'invalid_request':
        return 'That request was rejected before it ran. You were not charged.';
      case 'unauthorized':
      case 'not_configured':
        return 'Generation is not configured right now. You were not charged.';
      case 'timeout':
        return 'It took too long and was refunded automatically.';
      default:
        return 'Something broke on the way to the model. You were not charged.';
    }
  }
}

function authHeader(): string {
  const credentials = higgsfieldCredentials();
  if (!credentials) {
    throw new HiggsfieldError('Higgsfield credentials are not configured', 'not_configured');
  }
  return `Key ${credentials.keyId}:${credentials.keySecret}`;
}

function classify(status: number, body: string, correlationId?: string): HiggsfieldError {
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === 'string') detail = parsed.detail;
    else if (parsed.detail) detail = JSON.stringify(parsed.detail);
  } catch {
    /* keep raw body */
  }

  const message = `Higgsfield ${status}: ${detail}`;
  switch (status) {
    case 401:
      return new HiggsfieldError(message, 'unauthorized', status, false, correlationId);
    case 403:
      return new HiggsfieldError(
        message,
        'insufficient_provider_credits',
        status,
        false,
        correlationId,
      );
    case 404:
    case 423:
    case 503:
      return new HiggsfieldError(message, 'model_unavailable', status, false, correlationId);
    case 422:
      return new HiggsfieldError(message, 'invalid_request', status, false, correlationId);
    case 400:
      // 400 covers both bad parameters and "you already have too many running".
      return new HiggsfieldError(
        message,
        /concurren|limit/i.test(detail) ? 'rate_limited' : 'invalid_request',
        status,
        /concurren|limit/i.test(detail),
        correlationId,
      );
    case 429:
      return new HiggsfieldError(message, 'rate_limited', status, true, correlationId);
    default:
      return new HiggsfieldError(
        message,
        'server_error',
        status,
        status >= 500,
        correlationId,
      );
  }
}

async function request(
  url: string,
  init: RequestInit,
  { timeoutMs = 30_000, retries = 0 }: { timeoutMs?: number; retries?: number } = {},
): Promise<{ body: string; correlationId?: string }> {
  let lastError: HiggsfieldError | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        cache: 'no-store',
        headers: { Authorization: authHeader(), ...(init.headers ?? {}) },
      });
      const correlationId = response.headers.get('X-Correlation-ID') ?? undefined;
      const body = await response.text();
      if (response.ok) return { body, correlationId };

      const error = classify(response.status, body, correlationId);
      if (!error.retryable || attempt === retries) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof HiggsfieldError) {
        if (!error.retryable || attempt === retries) throw error;
        lastError = error;
      } else {
        const aborted = error instanceof Error && error.name === 'AbortError';
        const wrapped = new HiggsfieldError(
          aborted ? 'Request timed out' : `Network failure: ${String(error)}`,
          aborted ? 'timeout' : 'network_error',
          0,
          true,
        );
        if (attempt === retries) throw wrapped;
        lastError = wrapped;
      }
    } finally {
      clearTimeout(timer);
    }
    // Exponential backoff with jitter, as the docs recommend.
    const delay = Math.min(2 ** attempt * 500, 4_000) + Math.random() * 250;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError ?? new HiggsfieldError('Request failed', 'server_error');
}

/**
 * Submits a generation. Deliberately NOT retried: submissions take no
 * idempotency key, so a retry after an ambiguous timeout could bill twice.
 */
export async function submit(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<SubmitResult> {
  if (isMockMode()) return mockSubmit(endpoint, body);

  const { body: text } = await request(
    `${HIGGSFIELD_BASE_URL}${endpoint}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    { timeoutMs: 45_000, retries: 0 },
  );

  const parsed = JSON.parse(text) as {
    request_id?: string;
    status?: ProviderStatus;
    status_url?: string;
    cancel_url?: string;
  };
  if (!parsed.request_id) {
    throw new HiggsfieldError('Provider returned no request_id', 'server_error');
  }
  return {
    requestId: parsed.request_id,
    status: parsed.status ?? 'queued',
    // Use the URLs the provider handed back rather than rebuilding them.
    statusUrl: parsed.status_url ?? `${HIGGSFIELD_BASE_URL}/requests/${parsed.request_id}/status`,
    cancelUrl: parsed.cancel_url ?? `${HIGGSFIELD_BASE_URL}/requests/${parsed.request_id}/cancel`,
  };
}

/** Pulls the first usable media URL out of whichever shape the model returns. */
export function extractOutput(payload: unknown): { outputUrl?: string; posterUrl?: string } {
  if (!payload || typeof payload !== 'object') return {};
  const record = payload as Record<string, unknown>;

  const fromArray = (value: unknown): string | undefined => {
    if (!Array.isArray(value) || value.length === 0) return undefined;
    const first = value[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && typeof (first as { url?: unknown }).url === 'string') {
      return (first as { url: string }).url;
    }
    return undefined;
  };
  const fromObject = (value: unknown): string | undefined => {
    if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') {
      return (value as { url: string }).url;
    }
    return typeof value === 'string' ? value : undefined;
  };

  const video = fromObject(record.video) ?? fromArray(record.videos);
  const image = fromArray(record.images) ?? fromObject(record.image);
  const audio = fromObject(record.audio) ?? fromArray(record.audios);

  return {
    outputUrl: video ?? image ?? audio,
    posterUrl: video ? (fromArray(record.images) ?? fromObject(record.thumbnail)) : undefined,
  };
}

export async function getStatus(statusUrl: string): Promise<StatusResult> {
  if (isMockMode()) return mockStatus(statusUrl);

  // Status reads are safe to retry, so transient 5xx and network blips are absorbed.
  const { body } = await request(statusUrl, { method: 'GET' }, { timeoutMs: 20_000, retries: 3 });
  const parsed = JSON.parse(body) as {
    request_id?: string;
    status?: ProviderStatus;
    error?: string;
  };
  const { outputUrl, posterUrl } = extractOutput(parsed);
  return {
    requestId: parsed.request_id ?? '',
    status: parsed.status ?? 'in_progress',
    outputUrl,
    posterUrl,
    error: parsed.error,
    raw: parsed,
  };
}

/** Cancellation only succeeds while every job in the request is still queued. */
export async function cancel(cancelUrl: string): Promise<boolean> {
  if (isMockMode()) return mockCancel(cancelUrl);
  try {
    await request(cancelUrl, { method: 'POST' }, { timeoutMs: 15_000, retries: 0 });
    return true;
  } catch (error) {
    if (error instanceof HiggsfieldError && error.status === 400) return false;
    throw error;
  }
}

export interface UploadTarget {
  publicUrl: string;
  uploadUrl: string;
  contentType: string;
  uploadHeaders: Record<string, string>;
}

export async function createUploadTarget(contentType: string): Promise<UploadTarget> {
  const { body } = await request(
    `${HIGGSFIELD_BASE_URL}/files/generate-upload-url`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: contentType }),
    },
    { timeoutMs: 20_000, retries: 2 },
  );
  const parsed = JSON.parse(body) as {
    public_url: string;
    upload_url: string;
    content_type: string;
    upload_headers?: Record<string, string>;
  };
  return {
    publicUrl: parsed.public_url,
    uploadUrl: parsed.upload_url,
    contentType: parsed.content_type,
    uploadHeaders: parsed.upload_headers ?? { 'Content-Type': parsed.content_type },
  };
}

/** Uploads to presigned storage. No Higgsfield credentials go to this host. */
export async function uploadToTarget(target: UploadTarget, bytes: ArrayBuffer): Promise<string> {
  const response = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: target.uploadHeaders,
    body: bytes,
  });
  if (!response.ok) {
    throw new HiggsfieldError(
      `Upload failed: ${response.status} ${await response.text()}`,
      'server_error',
      response.status,
    );
  }
  return target.publicUrl;
}

export interface SoulStyle {
  id: string;
  name: string;
  description?: string;
  preview_url?: string;
}

export async function listSoulStyles(): Promise<SoulStyle[]> {
  if (isMockMode()) return [];
  const { body } = await request(
    `${HIGGSFIELD_BASE_URL}/v1/text2image/soul-styles/v2`,
    { method: 'GET' },
    { timeoutMs: 15_000, retries: 2 },
  );
  return JSON.parse(body) as SoulStyle[];
}
