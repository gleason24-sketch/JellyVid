/**
 * The generation pipeline, and the place every money promise is kept.
 *
 * Invariants:
 *  - Credits leave the wallet only inside jv_job_create, which fails closed.
 *  - Every non-delivering outcome (failed / nsfw / canceled / timeout /
 *    duplicate) refunds in the same statement that records it.
 *  - Nothing here trusts the browser for cost: the price is recomputed from the
 *    catalog server-side and compared against what the button quoted.
 */
import 'server-only';
import { call } from './db';
import {
  HiggsfieldError,
  getStatus,
  isTerminal,
  submit,
  type ProviderStatus,
} from './higgsfield';
import { modelForTask, TASKS, type TaskId, type Tier } from './models';
import { looksLikePublicFigure, moderationReason } from './moderation';
import { perceptualHash } from './phash';
import { getObject, putObject, storageKey } from './storage';
import { isMockMode } from './env';

export type JobStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'nsfw'
  | 'canceled'
  | 'timeout'
  | 'duplicate';

export interface Job {
  id: string;
  task: TaskId;
  tier: Tier;
  kind: 'image' | 'video';
  model_id: string;
  prompt: string;
  params: Record<string, unknown>;
  input_url: string | null;
  cost_credits: number;
  status: JobStatus;
  output_url: string | null;
  poster_url: string | null;
  phash: string | null;
  duplicate_of: string | null;
  error_reason: string | null;
  error_code: string | null;
  refunded: boolean;
  refund_reason: string | null;
  parent_job_id: string | null;
  share_slug: string | null;
  is_public: boolean;
  consent_at: string | null;
  attempts: number;
  created_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  provider_status_url?: string | null;
  prompt_key?: string;
  user_id?: string;
}

export interface Wallet {
  balance_credits: number;
  lifetime_granted: number;
  lifetime_purchased: number;
  lifetime_spent: number;
  lifetime_refunded: number;
  never_expires: true;
  expires_at: null;
}

/** Duplicate detection groups by prompt, so the key has to ignore noise. */
export function promptKey(taskId: string, prompt: string): string {
  const normalised = prompt
    .toLowerCase()
    .replace(/\[\[force:[a-z]+\]\]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${taskId}:${normalised}`;
}

export interface CreateJobInput {
  userId: string;
  task: TaskId;
  tier: Tier;
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  withAudio?: boolean;
  imageUrl?: string;
  /** Face/reference images for a cast job. */
  imageUrls?: string[];
  modelOverride?: string;
  /** Required before any likeness job runs. Complaint-map consent rule. */
  consent?: boolean;
  parentJobId?: string;
  /** What the Generate button said it would cost. Must match, or we refuse. */
  quotedCredits?: number;
}

export class JobError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'JobError';
  }
}

export interface CreateJobResult {
  job: Job;
  wallet: Wallet;
}

export async function createJob(input: CreateJobInput): Promise<CreateJobResult> {
  const task = TASKS[input.task];
  if (!task) throw new JobError('Unknown task', 'unknown_task');

  const prompt = input.prompt.trim();
  if (prompt.length < 3) throw new JobError('Write a few words first.', 'prompt_too_short');
  if (prompt.length > 2000) throw new JobError('That prompt is too long.', 'prompt_too_long');

  const model = modelForTask(input.task, input.tier, input.modelOverride);

  const references = (input.imageUrls ?? []).filter(Boolean);

  if (model.input === 'start-image' && !input.imageUrl) {
    throw new JobError('This one needs a photo to work from.', 'image_required');
  }
  if (model.input === 'references' && references.length === 0) {
    throw new JobError('Add at least one photo of the face to cast.', 'reference_required');
  }
  if (model.maxReferences && references.length > model.maxReferences) {
    throw new JobError(
      `Use at most ${model.maxReferences} reference photos.`,
      'too_many_references',
    );
  }
  // A likeness is involved whenever a face is the input or the subject.
  if ((task.likenessRisk || model.input !== 'none') && !input.consent) {
    throw new JobError(
      'Confirm you are this person or have their written consent.',
      'consent_required',
    );
  }

  // Blocked before submission means zero credits move at all -- complaint #5.
  if (looksLikePublicFigure(prompt)) {
    throw new JobError(moderationReason('prompt_public_figure'), 'prompt_public_figure');
  }

  // The price is authoritative here, never from the request body.
  const cost = model.credits;
  if (input.quotedCredits !== undefined && input.quotedCredits !== cost) {
    throw new JobError(
      'The price changed while you were on this page. Nothing was charged — check the new price and try again.',
      'price_mismatch',
    );
  }

  const fullPrompt = `${task.promptPrefix}${prompt}`;
  const generationInput = {
    prompt: fullPrompt,
    aspectRatio: input.aspectRatio ?? task.defaultAspect,
    imageUrl: input.imageUrl,
    imageUrls: references,
    durationSeconds: input.durationSeconds ?? task.defaultDuration,
    withAudio: input.withAudio ?? task.defaultAudio,
  };

  const created = await call<CreateJobResult>('jv_job_create', {
    p_user_id: input.userId,
    p_task: input.task,
    p_tier: input.tier,
    p_kind: model.kind,
    p_model_id: model.id,
    p_endpoint: model.endpoint,
    p_prompt: prompt,
    p_prompt_key: promptKey(input.task, prompt),
    p_params: generationInput as unknown as Record<string, unknown>,
    p_input_url: input.imageUrl ?? references[0] ?? null,
    p_cost: cost,
    p_consent_at: input.consent ? new Date().toISOString() : null,
    p_parent_job_id: input.parentJobId ?? null,
  });

  // From here the credits are already spent, so every failure path below must
  // end in jv_job_finalize, which refunds.
  try {
    const result = await submit(model.endpoint, model.buildBody(generationInput));
    const job = await call<Job>('jv_job_submitted', {
      p_job_id: created.job.id,
      p_request_id: result.requestId,
      p_status_url: result.statusUrl,
      p_cancel_url: result.cancelUrl,
    });
    return { job, wallet: created.wallet };
  } catch (error) {
    const higgsfield = error instanceof HiggsfieldError ? error : null;
    const job = await finalize(created.job.id, 'failed', {
      errorReason: higgsfield?.userMessage ?? 'We could not reach the model. You were not charged.',
      errorCode: higgsfield?.code ?? 'submit_failed',
    });
    const wallet = await call<Wallet>('jv_wallet_get', { p_user_id: input.userId });
    return { job, wallet };
  }
}

interface FinalizeExtras {
  outputUrl?: string;
  storedUrl?: string;
  posterUrl?: string;
  phash?: string;
  sha?: string;
  errorReason?: string;
  errorCode?: string;
  duplicateOf?: string;
}

export function finalize(
  jobId: string,
  status: JobStatus,
  extras: FinalizeExtras = {},
): Promise<Job> {
  return call<Job>('jv_job_finalize', {
    p_job_id: jobId,
    p_status: status,
    p_output_url: extras.outputUrl ?? null,
    p_stored_url: extras.storedUrl ?? null,
    p_poster_url: extras.posterUrl ?? null,
    p_phash: extras.phash ?? null,
    p_sha: extras.sha ?? null,
    p_error_reason: extras.errorReason ?? null,
    p_error_code: extras.errorCode ?? null,
    p_duplicate_of: extras.duplicateOf ?? null,
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Mock output URLs are app-relative; everything else is an absolute CDN URL. */
async function fetchOutput(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (url.startsWith('/api/mock/media/')) {
    const seed = Number(url.split('/').pop()?.replace('.png', ''));
    const { renderMockPng } = await import('./mock-image');
    return { bytes: renderMockPng(seed), contentType: 'image/png' };
  }
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

/** A job is refunded rather than left hanging once it passes this deadline. */
export function deadlineSeconds(modelId: string): number {
  const base = Number(process.env.JELLYVID_JOB_TIMEOUT_SECONDS ?? '0');
  if (base > 0) return base;
  // Three times the model's typical runtime, floored at four minutes.
  const typical = MODEL_TIMEOUTS[modelId] ?? 300;
  return Math.max(typical * 3, 240);
}

const MODEL_TIMEOUTS: Record<string, number> = {
  'soul-draft': 45,
  'soul-2-final': 75,
  'recraft-final': 60,
  'marketing-studio-final': 75,
  'seedance-2-draft': 180,
  'seedance-25-final': 300,
  'kling-3-final': 300,
  'wan-3-final': 300,
  'seedance-2-i2v-draft': 180,
  'seedance-25-i2v-final': 300,
};

/**
 * Polls the provider once and settles the job if it has reached a terminal
 * state. Safe to call repeatedly and from several places at once: every write
 * lands in jv_job_finalize, which is idempotent.
 */
export async function advanceJob(job: Job): Promise<Job> {
  if (isTerminal(job.status) || job.status === 'timeout' || job.status === 'duplicate') {
    return job;
  }

  const started = job.submitted_at ? Date.parse(job.submitted_at) : Date.parse(job.created_at);
  const overdue = Date.now() - started > deadlineSeconds(job.model_id) * 1000;

  if (!job.provider_status_url) {
    // Submitted but we never recorded a status URL: nothing to poll, so refund.
    if (overdue) {
      return finalize(job.id, 'timeout', {
        errorReason: 'We lost track of this job, so it was refunded automatically.',
        errorCode: 'no_status_url',
      });
    }
    return job;
  }

  let status: ProviderStatus;
  let outputUrl: string | undefined;
  let posterUrl: string | undefined;
  let providerError: string | undefined;

  try {
    const result = await getStatus(job.provider_status_url);
    status = result.status;
    outputUrl = result.outputUrl;
    posterUrl = result.posterUrl;
    providerError = result.error;
  } catch (error) {
    // A status read that keeps failing is not a reason to keep the money.
    if (overdue) {
      const higgsfield = error instanceof HiggsfieldError ? error : null;
      return finalize(job.id, 'timeout', {
        errorReason: higgsfield?.userMessage ?? 'We stopped being able to check on this job, so it was refunded.',
        errorCode: higgsfield?.code ?? 'status_unreadable',
      });
    }
    return job;
  }

  if (!isTerminal(status)) {
    if (overdue) {
      return finalize(job.id, 'timeout', {
        errorReason: 'This ran past our time limit, so it was refunded automatically.',
        errorCode: 'deadline_exceeded',
      });
    }
    return job;
  }

  if (status === 'nsfw') {
    return finalize(job.id, 'nsfw', {
      errorReason: moderationReason('nsfw'),
      errorCode: 'nsfw',
    });
  }
  if (status === 'canceled') {
    return finalize(job.id, 'canceled', { errorCode: 'canceled' });
  }
  if (status === 'failed') {
    return finalize(job.id, 'failed', {
      errorReason: providerError ?? 'The model failed on this one. You were refunded.',
      errorCode: 'provider_failed',
    });
  }

  // Completed. Everything below decides whether it is a real delivery.
  if (!outputUrl) {
    return finalize(job.id, 'failed', {
      errorReason: 'The model reported success but returned nothing. You were refunded.',
      errorCode: 'empty_output',
    });
  }

  const downloaded = await fetchOutput(outputUrl);
  if (!downloaded) {
    return finalize(job.id, 'failed', {
      errorReason: 'We could not retrieve the finished file. You were refunded.',
      errorCode: 'download_failed',
    });
  }

  const sha = await sha256Hex(downloaded.bytes);
  // pHash needs a decodable still. Video keeps the byte hash only; see
  // docs/HIGGSFIELD_NOTES.md for why frame extraction is not done here.
  const hash = perceptualHash(downloaded.bytes);

  if (hash) {
    const duplicateOf = await call<string | null>('jv_find_duplicate', {
      p_user_id: job.user_id ?? '',
      p_job_id: job.id,
      p_prompt_key: job.prompt_key ?? promptKey(job.task, job.prompt),
      p_phash: hash,
      p_distance: 5,
    });
    if (duplicateOf) {
      // You already paid for this picture once. Complaint #4.
      return finalize(job.id, 'duplicate', {
        outputUrl,
        phash: hash,
        sha,
        duplicateOf,
        errorReason:
          'This came back near-identical to an output you already have for this prompt, so it was refunded.',
        errorCode: 'duplicate_output',
      });
    }
  }

  const key = storageKey(job.id, downloaded.contentType);
  const mirrored = await putObject(key, downloaded.bytes, downloaded.contentType);

  return finalize(job.id, 'completed', {
    outputUrl,
    // Our own URL outlives the provider's ~7-day retention.
    storedUrl: mirrored ? `/api/media/${key}` : undefined,
    posterUrl,
    phash: hash ?? undefined,
    sha,
  });
}

export async function getJob(jobId: string, userId: string | null): Promise<Job | null> {
  return call<Job | null>('jv_job_get', { p_job_id: jobId, p_user_id: userId });
}

export async function listJobs(userId: string, limit = 50): Promise<Job[]> {
  return call<Job[]>('jv_jobs_list', { p_user_id: userId, p_limit: limit });
}

/**
 * Sweeps jobs the browser stopped polling for. This is what makes the refund
 * promise hold when someone closes the tab mid-generation.
 */
export async function reconcilePending(limit = 25): Promise<{ checked: number; settled: number }> {
  const pending = await call<Array<Pick<Job, 'id'>>>('jv_jobs_pending', { p_limit: limit });
  let settled = 0;

  for (const row of pending) {
    const job = await getJob(row.id, null);
    if (!job) continue;
    const advanced = await advanceJob(job);
    if (advanced.status !== job.status) settled += 1;
  }

  return { checked: pending.length, settled };
}

export async function readStoredMedia(key: string) {
  if (!/^[a-zA-Z0-9-]+\.[a-z0-9]{2,4}$/.test(key)) return null;
  return getObject(key);
}

export function mockModeActive(): boolean {
  return isMockMode();
}
