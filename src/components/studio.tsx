'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { TASK_LIST, TASKS, MODELS, type TaskId, type Tier } from '@/lib/models';
import { creditsToUsd } from '@/lib/pricing';
import { Badge, BalanceDisplay } from './ui';
import { TaskIcon } from './icons';

interface Wallet {
  balance_credits: number;
  lifetime_refunded: number;
}

interface Job {
  id: string;
  task: TaskId;
  tier: Tier;
  kind: 'image' | 'video';
  model_id: string;
  prompt: string;
  cost_credits: number;
  status:
    | 'queued'
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'nsfw'
    | 'canceled'
    | 'timeout'
    | 'duplicate';
  output_url: string | null;
  error_reason: string | null;
  error_code: string | null;
  refunded: boolean;
  refund_reason: string | null;
  parent_job_id: string | null;
  share_slug: string | null;
  created_at: string;
}

const ASPECTS = ['9:16', '16:9', '1:1', '4:3'];
const TERMINAL = ['completed', 'failed', 'nsfw', 'canceled', 'timeout', 'duplicate'];

/** Copy for every state a job can be in. No state is left as a bare spinner. */
const STATUS_COPY: Record<Job['status'], { label: string; tone: 'pink' | 'blue' | 'yellow' | 'muted' | 'good' }> = {
  queued: { label: 'Queued', tone: 'muted' },
  in_progress: { label: 'Generating', tone: 'blue' },
  completed: { label: 'Done', tone: 'good' },
  failed: { label: 'Failed · refunded', tone: 'yellow' },
  nsfw: { label: 'Blocked · cost $0', tone: 'yellow' },
  canceled: { label: 'Canceled · refunded', tone: 'yellow' },
  timeout: { label: 'Timed out · refunded', tone: 'yellow' },
  duplicate: { label: 'Duplicate · refunded', tone: 'yellow' },
};

function isVideoUrl(url: string | null): boolean {
  return Boolean(url && /\.(mp4|mov|webm)(\?|$)/i.test(url));
}

export default function Studio({ initialWallet }: { initialWallet: Wallet | null }) {
  const [wallet, setWallet] = useState<Wallet | null>(initialWallet);
  const [task, setTask] = useState<TaskId | null>(null);
  const [prompt, setPrompt] = useState('');
  const [tier, setTier] = useState<Tier>('draft');
  const [aspect, setAspect] = useState('9:16');
  const [duration, setDuration] = useState(5);
  const [withAudio, setWithAudio] = useState(true);
  const [modelOverride, setModelOverride] = useState('');
  const [consent, setConsent] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [rewriteNotes, setRewriteNotes] = useState<string[] | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const spec = task ? TASKS[task] : null;
  const activeModel = spec
    ? MODELS[modelOverride || (tier === 'draft' ? spec.draftModel : spec.finalModel)]
    : null;
  const cost = activeModel?.credits ?? 0;
  const affordable = !wallet || wallet.balance_credits >= cost;

  const loadJobs = useCallback(async () => {
    const response = await fetch('/api/jobs', { cache: 'no-store' });
    if (!response.ok) return;
    const data = (await response.json()) as { jobs?: Job[]; wallet?: Wallet };
    if (data.jobs) setJobs(data.jobs);
    if (data.wallet) setWallet(data.wallet);
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  // Poll only while something is actually running, and stop the moment the last
  // job settles -- a live status for every job, and no idle polling.
  useEffect(() => {
    const pending = jobs.filter((job) => !TERMINAL.includes(job.status));
    if (pending.length === 0) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      for (const job of pending) {
        if (cancelled) return;
        try {
          const response = await fetch(`/api/jobs/${job.id}`, { cache: 'no-store' });
          if (!response.ok) continue;
          const data = (await response.json()) as { job: Job; wallet: Wallet };
          setJobs((current) => current.map((item) => (item.id === data.job.id ? data.job : item)));
          if (data.wallet) setWallet(data.wallet);
        } catch {
          /* keep polling; a dropped request is not a failure */
        }
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobs]);

  function chooseTask(id: TaskId) {
    const next = TASKS[id];
    setTask(id);
    setAspect(next.defaultAspect);
    setDuration(next.defaultDuration);
    setWithAudio(next.defaultAudio);
    setModelOverride('');
    setConsent(false);
    setImageUrl('');
    setError(null);
    setRewriteNotes(null);
    requestAnimationFrame(() => promptRef.current?.focus());
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: form });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? 'Upload failed.');
      setImageUrl(data.url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    if (!task || !spec) return;
    setBusy(true);
    setError(null);
    setRewriteNotes(null);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          tier,
          prompt,
          aspectRatio: aspect,
          durationSeconds: duration,
          withAudio,
          imageUrl: imageUrl || undefined,
          modelOverride: modelOverride || undefined,
          consent,
          // Sent so the server can refuse if the price moved under us.
          quotedCredits: cost,
        }),
      });
      const data = (await response.json()) as {
        job?: Job;
        wallet?: Wallet;
        recoveryCode?: string | null;
        error?: string;
      };
      if (!response.ok || !data.job) throw new Error(data.error ?? 'Could not start.');
      setJobs((current) => [data.job as Job, ...current]);
      if (data.wallet) setWallet(data.wallet);
      if (data.recoveryCode) setRecoveryCode(data.recoveryCode);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Could not start.');
    } finally {
      setBusy(false);
    }
  }

  async function rewrite() {
    const response = await fetch('/api/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!response.ok) return;
    const data = (await response.json()) as { prompt: string; notes: string[] };
    setPrompt(data.prompt);
    setRewriteNotes(data.notes);
    setError(null);
  }

  async function upgrade(job: Job) {
    const finalModel = MODELS[TASKS[job.task].finalModel];
    setBusy(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotedCredits: finalModel.credits }),
      });
      const data = (await response.json()) as { job?: Job; wallet?: Wallet; error?: string };
      if (!response.ok || !data.job) throw new Error(data.error ?? 'Upgrade failed.');
      setJobs((current) => [data.job as Job, ...current]);
      if (data.wallet) setWallet(data.wallet);
    } catch (upgradeError) {
      setError(upgradeError instanceof Error ? upgradeError.message : 'Upgrade failed.');
    } finally {
      setBusy(false);
    }
  }

  async function share(job: Job) {
    const response = await fetch(`/api/jobs/${job.id}/share`, { method: 'POST' });
    if (!response.ok) return;
    const data = (await response.json()) as { job: Job; url: string };
    setJobs((current) => current.map((item) => (item.id === data.job.id ? data.job : item)));
    const full = `${window.location.origin}${data.url}`;
    try {
      if (navigator.share) await navigator.share({ url: full, title: 'Made with JellyVid' });
      else await navigator.clipboard.writeText(full);
    } catch {
      /* the link is on the card either way */
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="jv-card mb-6 flex items-center justify-between gap-4 p-4">
        {wallet ? (
          <BalanceDisplay credits={wallet.balance_credits} size="sm" />
        ) : (
          <div>
            <div className="text-xl font-extrabold jv-glow-pink">200 free credits</div>
            <div className="mt-1 text-xs font-semibold text-[var(--color-blue)]">
              Granted the moment you generate. No signup.
            </div>
          </div>
        )}
        <Link href="/pricing" className="jv-btn jv-btn-ghost !min-h-10 !px-4 !text-sm">
          Top up
        </Link>
      </div>

      {recoveryCode ? (
        <div className="jv-card mb-6 border-[var(--color-yellow)] p-4">
          <p className="text-sm font-bold text-[var(--color-yellow)]">Save your recovery code</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            This is the only way to move this wallet to another device. We will not email it to you.
          </p>
          <code className="mt-3 block rounded-lg bg-black/50 px-3 py-2 font-mono text-lg tracking-widest">
            {recoveryCode}
          </code>
        </div>
      ) : null}

      <h1 className="mb-1 text-2xl font-extrabold sm:text-3xl">What are you making?</h1>
      <p className="mb-5 text-sm text-[var(--color-muted)]">
        Pick one. The model is chosen for you — change it under Advanced if you want.
      </p>

      <div className="mb-8 grid grid-cols-2 gap-3">
        {TASK_LIST.map((item) => {
          const selected = task === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => chooseTask(item.id)}
              aria-pressed={selected}
              className={`jv-card flex min-h-[124px] flex-col items-start gap-2 p-4 text-left transition-all ${
                selected
                  ? 'border-[var(--color-pink)] shadow-[0_0_0_1px_var(--color-pink),0_14px_40px_-20px_rgba(255,43,214,0.9)]'
                  : 'hover:border-[var(--color-pink-soft)]'
              }`}
            >
              <TaskIcon
                name={item.icon}
                className={`h-6 w-6 ${selected ? 'text-[var(--color-pink)]' : 'text-[var(--color-blue)]'}`}
              />
              <span className="text-base font-bold leading-tight">{item.title}</span>
              <span className="text-xs leading-snug text-[var(--color-muted)]">{item.blurb}</span>
            </button>
          );
        })}
      </div>

      {spec ? (
        <div className="jv-card mb-8 p-4 sm:p-5">
          <label htmlFor="prompt" className="mb-2 block text-sm font-bold">
            Describe it in plain words
          </label>
          <textarea
            id="prompt"
            ref={promptRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={spec.placeholder}
            rows={3}
            className="jv-input resize-y"
          />

          {rewriteNotes ? (
            <ul className="mt-2 space-y-1 text-xs text-[var(--color-blue)]">
              {rewriteNotes.map((note) => (
                <li key={note}>· {note}</li>
              ))}
            </ul>
          ) : null}

          {spec.needsUpload ? (
            <div className="mt-4">
              <label htmlFor="photo" className="mb-2 block text-sm font-bold">
                Your photo
              </label>
              <input
                id="photo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
                className="jv-input file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-pink)] file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white"
              />
              {uploading ? (
                <p className="mt-2 text-xs text-[var(--color-blue)] jv-pulse">Uploading…</p>
              ) : null}
              {imageUrl ? (
                <p className="mt-2 text-xs text-[#8dffc4]">Photo ready.</p>
              ) : null}
            </div>
          ) : null}

          {spec.likenessRisk || spec.needsUpload ? (
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-pink)]"
              />
              <span className="text-[var(--color-muted)]">
                I am this person, or I have their written consent. We record the time you confirm
                this.
              </span>
            </label>
          ) : null}

          <div className="mt-4 flex gap-2" role="group" aria-label="Quality tier">
            {(['draft', 'final'] as Tier[]).map((value) => {
              const model = MODELS[value === 'draft' ? spec.draftModel : spec.finalModel];
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setTier(value);
                    setModelOverride('');
                  }}
                  aria-pressed={tier === value}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                    tier === value
                      ? 'border-[var(--color-pink)] bg-[rgba(255,43,214,0.1)]'
                      : 'border-[var(--color-line)]'
                  }`}
                >
                  <span className="block font-bold capitalize">{value}</span>
                  <span className="block text-xs text-[var(--color-muted)]">
                    {model.credits} credits · {creditsToUsd(model.credits)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Draft first, then upgrade the one you like. It is cheaper than guessing.
          </p>

          <button
            type="button"
            onClick={() => setAdvanced((value) => !value)}
            aria-expanded={advanced}
            className="mt-4 text-sm font-semibold text-[var(--color-blue)]"
          >
            {advanced ? 'Hide advanced' : 'Advanced'}
          </button>

          {advanced ? (
            <div className="mt-3 space-y-4 rounded-xl border border-[var(--color-line)] p-3">
              <div>
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                  Shape
                </span>
                <div className="flex flex-wrap gap-2">
                  {ASPECTS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAspect(value)}
                      aria-pressed={aspect === value}
                      className={`rounded-full border px-3 py-2 text-sm ${
                        aspect === value
                          ? 'border-[var(--color-blue)] text-[var(--color-blue)]'
                          : 'border-[var(--color-line)] text-[var(--color-muted)]'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="duration" className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                  Length: {duration}s
                </label>
                <input
                  id="duration"
                  type="range"
                  min={4}
                  max={10}
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className="w-full accent-[var(--color-pink)]"
                />
              </div>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={withAudio}
                  onChange={(event) => setWithAudio(event.target.checked)}
                  className="h-5 w-5 accent-[var(--color-pink)]"
                />
                <span className="text-[var(--color-muted)]">Generate sound</span>
              </label>

              <div>
                <label htmlFor="model" className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                  Model
                </label>
                <select
                  id="model"
                  value={modelOverride}
                  onChange={(event) => setModelOverride(event.target.value)}
                  className="jv-input"
                >
                  <option value="">
                    Chosen for you ({MODELS[tier === 'draft' ? spec.draftModel : spec.finalModel].label})
                  </option>
                  {spec.alternateFinals.map((id) => (
                    <option key={id} value={id}>
                      {MODELS[id].label} — {MODELS[id].credits} credits
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {error ? (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-[var(--color-yellow)] bg-[rgba(242,255,92,0.07)] p-3 text-sm"
            >
              <p className="font-semibold text-[var(--color-yellow)]">{error}</p>
              <button
                type="button"
                onClick={() => void rewrite()}
                className="mt-2 text-sm font-bold underline decoration-dotted"
              >
                Rewrite safely
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || prompt.trim().length < 3 || !affordable || (spec.needsUpload && !imageUrl)}
            className="jv-btn jv-btn-primary mt-5 w-full"
          >
            {busy ? 'Starting…' : `Generate: ${cost} credits`}
          </button>
          <p className="mt-2 text-center text-xs text-[var(--color-muted)]">
            {affordable
              ? `That is ${creditsToUsd(cost)}. You are charged once, before it runs — and refunded automatically if it fails, is blocked, or comes back a duplicate.`
              : 'Not enough credits for this one. Nothing will be charged.'}
          </p>
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <>
          <h2 className="mb-3 text-lg font-extrabold">Your generations</h2>
          <div className="space-y-3">
            {jobs.map((job) => {
              const status = STATUS_COPY[job.status];
              const running = !TERMINAL.includes(job.status);
              return (
                <article key={job.id} className="jv-card overflow-hidden">
                  {job.output_url && job.status === 'completed' ? (
                    isVideoUrl(job.output_url) ? (
                      <video
                        src={job.output_url}
                        controls
                        playsInline
                        preload="metadata"
                        className="aspect-video w-full bg-black object-contain"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={job.output_url}
                        alt={job.prompt}
                        loading="lazy"
                        className="aspect-video w-full bg-black object-contain"
                      />
                    )
                  ) : null}

                  <div className="p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={status.tone}>
                        {running ? <span className="jv-pulse">●</span> : null} {status.label}
                      </Badge>
                      <Badge tone="muted">{job.tier}</Badge>
                      <Badge tone="muted">{job.cost_credits} cr</Badge>
                      {job.refunded ? <Badge tone="good">+{job.cost_credits} refunded</Badge> : null}
                    </div>

                    <p className="line-clamp-2 text-sm text-[var(--color-muted)]">{job.prompt}</p>

                    {job.error_reason ? (
                      <p className="mt-2 text-sm text-[var(--color-yellow)]">{job.error_reason}</p>
                    ) : null}

                    {job.status === 'nsfw' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTask(job.task);
                          setPrompt(job.prompt);
                          void rewrite();
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="jv-btn jv-btn-ghost mt-3 !min-h-10 !px-4 !text-sm"
                      >
                        Rewrite safely and retry
                      </button>
                    ) : null}

                    {job.status === 'completed' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {job.tier === 'draft' ? (
                          <button
                            type="button"
                            onClick={() => void upgrade(job)}
                            disabled={busy}
                            className="jv-btn jv-btn-primary !min-h-10 !px-4 !text-sm"
                          >
                            Make it final: {MODELS[TASKS[job.task].finalModel].credits} credits
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void share(job)}
                          className="jv-btn jv-btn-ghost !min-h-10 !px-4 !text-sm"
                        >
                          {job.share_slug ? 'Copy link' : 'Share'}
                        </button>
                        {job.output_url ? (
                          <a
                            href={job.output_url}
                            download
                            className="jv-btn jv-btn-ghost !min-h-10 !px-4 !text-sm"
                          >
                            Download
                          </a>
                        ) : null}
                        {job.share_slug ? (
                          <Link
                            href={`/s/${job.share_slug}`}
                            className="jv-btn jv-btn-ghost !min-h-10 !px-4 !text-sm"
                          >
                            Open page
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
