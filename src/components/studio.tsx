'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  MODELS,
  TASKS,
  TASK_LIST,
  resolvePreset,
  type ScenePreset,
  type TaskId,
  type Tier,
} from '@/lib/models';
import { creditsToUsd } from '@/lib/pricing';
import { Badge, BalanceDisplay } from './ui';
import { TaskIcon } from './icons';
import LazyVideo from './lazy-video';

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
  refunded: boolean;
  share_slug: string | null;
  created_at: string;
}

const ASPECTS = ['9:16', '16:9', '1:1', '4:3'];
const TERMINAL = ['completed', 'failed', 'nsfw', 'canceled', 'timeout', 'duplicate'];
const MAX_REFERENCES = 3;

const STATUS_COPY: Record<
  Job['status'],
  { label: string; tone: 'pink' | 'blue' | 'yellow' | 'muted' | 'good' }
> = {
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

export default function Studio({
  initialWallet,
  initialTask,
  initialPrompt,
  initialScene,
}: {
  initialWallet: Wallet | null;
  initialTask?: TaskId;
  /** Pre-filled when arriving from a remix link. */
  initialPrompt?: string;
  /** Pre-selected when arriving from a scene tile. */
  initialScene?: string;
}) {
  const [wallet, setWallet] = useState<Wallet | null>(initialWallet);
  const [task, setTask] = useState<TaskId | null>(initialTask ?? 'star_in_it');
  const startingTask = initialTask ?? 'star_in_it';
  const startingPreset = initialScene
    ? TASKS[startingTask].presets.find((preset) => preset.id === initialScene)
    : undefined;

  const [prompt, setPrompt] = useState(
    initialPrompt ?? (startingPreset ? resolvePreset(startingPreset, startingTask) : ''),
  );
  const [presetId, setPresetId] = useState<string | null>(startingPreset?.id ?? null);
  const [tier, setTier] = useState<Tier>('draft');
  const [aspect, setAspect] = useState(startingPreset?.aspect ?? '9:16');
  const [duration, setDuration] = useState(5);
  const [withAudio, setWithAudio] = useState(true);
  const [modelOverride, setModelOverride] = useState('');
  const [consent, setConsent] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [references, setReferences] = useState<string[]>([]);
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
  const needsFaces = spec?.input === 'references';
  const needsPhoto = spec?.input === 'start-image';
  const inputsReady = needsFaces ? references.length > 0 : needsPhoto ? Boolean(imageUrl) : true;

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

  // Poll only while something is running, and stop the moment the last job
  // settles -- a live status for every job, and no idle polling.
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
          /* a dropped poll is not a failure; keep going */
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
    setPresetId(null);
    setPrompt('');
    setError(null);
    setRewriteNotes(null);
  }

  function choosePreset(preset: ScenePreset) {
    if (!task) return;
    setPresetId(preset.id);
    setPrompt(resolvePreset(preset, task));
    setAspect(preset.aspect);
    setDuration(preset.duration);
    setWithAudio(preset.audio);
    setError(null);
  }

  async function uploadFiles(files: FileList) {
    setUploading(true);
    setError(null);
    try {
      const room = needsFaces ? MAX_REFERENCES - references.length : 1;
      for (const file of Array.from(files).slice(0, Math.max(room, 0))) {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/upload', { method: 'POST', body: form });
        const data = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !data.url) throw new Error(data.error ?? 'Upload failed.');
        if (needsFaces) setReferences((current) => [...current, data.url as string]);
        else setImageUrl(data.url);
      }
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
          imageUrls: references.length > 0 ? references : undefined,
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
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-5">
      <div className="jv-panel mb-5 flex items-center justify-between gap-4 p-4">
        {wallet ? (
          <BalanceDisplay credits={wallet.balance_credits} size="sm" />
        ) : (
          <div>
            <div className="jv-display text-xl">200 free credits</div>
            <div className="mt-1 text-xs font-semibold text-[var(--color-blue)]">
              Yours the moment you generate. No signup.
            </div>
          </div>
        )}
        <Link href="/pricing" className="jv-btn jv-btn-ghost !min-h-10 !px-4 !text-sm">
          Top up
        </Link>
      </div>

      {recoveryCode ? (
        <div className="jv-panel mb-5 border-[var(--color-yellow)] p-4">
          <p className="text-sm font-bold text-[var(--color-yellow)]">Save your recovery code</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            This is the only way to open this wallet on another device. We will not email it.
          </p>
          <code className="mt-3 block rounded-lg bg-black/50 px-3 py-2 font-mono text-lg tracking-widest">
            {recoveryCode}
          </code>
        </div>
      ) : null}

      {initialPrompt ? (
        <div className="jv-panel mb-5 border-[var(--color-blue)] p-4">
          <p className="text-sm font-bold text-[var(--color-blue)]">Remixing a scene</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            The scene below came from the video you were watching. Add your face and press
            generate.
          </p>
        </div>
      ) : null}

      <p className="jv-eyebrow mb-2">Step 1</p>
      <h1 className="jv-display mb-4 text-[clamp(1.6rem,7vw,2.25rem)]">What are you making?</h1>

      {/* A horizontal rail: five options, one screen, no scroll-to-choose. */}
      <div className="jv-rail -mx-4 mb-7 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TASK_LIST.map((item) => {
          const selected = task === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => chooseTask(item.id)}
              aria-pressed={selected}
              className={`relative flex w-[140px] shrink-0 snap-start flex-col items-start gap-2 rounded-[var(--radius-card)] border p-3.5 text-left transition-colors ${
                selected
                  ? 'border-[var(--color-pink)] bg-[rgba(255,43,214,0.08)]'
                  : 'border-[var(--color-line-soft)] bg-[var(--color-surface)] hover:border-[var(--color-line)]'
              }`}
            >
              {item.featured ? (
                <span className="absolute right-2.5 top-2.5 rounded bg-[var(--color-yellow)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-black">
                  New
                </span>
              ) : null}
              <TaskIcon
                name={item.icon}
                className={`h-5 w-5 ${selected ? 'text-[var(--color-pink)]' : 'text-[var(--color-muted)]'}`}
              />
              <span className="jv-display text-[13px] leading-tight">{item.title}</span>
              <span className="text-[11px] leading-snug text-[var(--color-muted)]">
                {item.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {spec ? (
        <div className="jv-panel mb-8 p-4 sm:p-5">
          {/* ---------------------------------------------- face references --- */}
          {needsFaces ? (
            <div className="mb-5">
              <label className="mb-1.5 block text-sm font-bold">
                Your face{' '}
                <span className="font-normal text-[var(--color-muted)]">
                  — 1 to {MAX_REFERENCES} photos, clear and well lit
                </span>
              </label>

              <div className="flex flex-wrap gap-2.5">
                {references.map((url, index) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Reference ${index + 1}`}
                      className="h-20 w-20 rounded-xl border border-[var(--color-line)] object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setReferences((c) => c.filter((item) => item !== url))}
                      aria-label={`Remove reference ${index + 1}`}
                      className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black text-sm font-bold text-white ring-1 ring-[var(--color-line)]"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {references.length < MAX_REFERENCES ? (
                  <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-line)] text-center text-[var(--color-muted)] transition-colors hover:border-[var(--color-pink)] hover:text-[var(--color-pink)]">
                    <span className="text-2xl leading-none">+</span>
                    <span className="text-[10px] font-semibold">Add photo</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        if (event.target.files?.length) void uploadFiles(event.target.files);
                        event.target.value = '';
                      }}
                    />
                  </label>
                ) : null}
              </div>

              {uploading ? (
                <p className="mt-2 text-xs text-[var(--color-blue)] jv-pulse">Uploading…</p>
              ) : null}
              <p className="mt-2 text-xs text-[var(--color-faint)]">
                Photos go straight to the model provider and are never shown to anyone else.
              </p>
            </div>
          ) : null}

          {/* ------------------------------------------------ single photo --- */}
          {needsPhoto ? (
            <div className="mb-5">
              <label htmlFor="photo" className="mb-1.5 block text-sm font-bold">
                Your photo
              </label>
              <input
                id="photo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  if (event.target.files?.length) void uploadFiles(event.target.files);
                }}
                className="jv-input file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-pink)] file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white"
              />
              {uploading ? (
                <p className="mt-2 text-xs text-[var(--color-blue)] jv-pulse">Uploading…</p>
              ) : null}
              {imageUrl ? <p className="mt-2 text-xs text-[#8dffc4]">Photo ready.</p> : null}
            </div>
          ) : null}

          {/* ----------------------------------------------------- scenes --- */}
          {spec.presets.length > 0 ? (
            <div className="mb-5">
              <span className="mb-2.5 block text-sm font-bold">
                Pick a scene{' '}
                <span className="font-normal text-[var(--color-muted)]">
                  — or write your own below
                </span>
              </span>
              {/* A rail, so eight scenes cost one screen instead of four. */}
              <div className="jv-rail -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                {spec.presets.map((preset) => {
                  const selected = presetId === preset.id;
                  const [from, to] = preset.tone;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => choosePreset(preset)}
                      aria-pressed={selected}
                      className={`jv-tile aspect-[3/4] w-[30vw] max-w-[132px] shrink-0 snap-start text-left transition-all sm:w-[120px] ${
                        selected ? 'ring-2 ring-[var(--color-pink)]' : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      <span
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(155deg, ${from} -20%, ${to} 62%, #000 100%)`,
                        }}
                      />
                      {preset.previewUrl ? (
                        <LazyVideo
                          src={preset.previewUrl}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : null}
                      <span className="jv-tile-label block">
                        <span className="jv-display block text-[13px] text-white">
                          {preset.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <label htmlFor="prompt" className="mb-2 block text-sm font-bold">
            {spec.presets.length > 0 ? 'Scene description' : 'Describe it in plain words'}
          </label>
          <textarea
            id="prompt"
            ref={promptRef}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setPresetId(null);
            }}
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

          {spec.likenessRisk || spec.input !== 'none' ? (
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-pink)]"
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
            Draft first, then upgrade the one you like. Cheaper than guessing.
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
                <label
                  htmlFor="duration"
                  className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]"
                >
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

              {spec.alternateFinals.length > 0 ? (
                <div>
                  <label
                    htmlFor="model"
                    className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]"
                  >
                    Model
                  </label>
                  <select
                    id="model"
                    value={modelOverride}
                    onChange={(event) => setModelOverride(event.target.value)}
                    className="jv-input"
                  >
                    <option value="">
                      Chosen for you (
                      {MODELS[tier === 'draft' ? spec.draftModel : spec.finalModel].label})
                    </option>
                    {spec.alternateFinals.map((id) => (
                      <option key={id} value={id}>
                        {MODELS[id].label} — {MODELS[id].credits} credits
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
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
            disabled={
              busy || prompt.trim().length < 3 || !affordable || !inputsReady || !consentSatisfied(spec, consent)
            }
            className="jv-btn jv-btn-primary mt-5 w-full"
          >
            {busy ? 'Starting…' : `Generate: ${cost} credits`}
          </button>
          <p className="mt-2 text-center text-xs text-[var(--color-muted)]">
            {!affordable
              ? 'Not enough credits for this one. Nothing will be charged.'
              : `That is ${creditsToUsd(cost)}. Charged once, before it runs — and refunded automatically if it fails, is blocked, or comes back a duplicate.`}
          </p>
        </div>
      ) : null}

      <div id="results" className="scroll-mt-20">
        {jobs.length > 0 ? (
          <>
            <h2 className="jv-display mb-3 text-xl">Your generations</h2>
            <div className="space-y-3">
              {jobs.map((job) => {
                const status = STATUS_COPY[job.status];
                const running = !TERMINAL.includes(job.status);
                return (
                  <article key={job.id} className="jv-panel overflow-hidden">
                    {running ? (
                      <div className="flex aspect-video w-full items-center justify-center bg-black/50">
                        <div className="text-center">
                          <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-pink)]" />
                          <p className="text-xs font-semibold text-[var(--color-blue)]">
                            {status.label}…
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--color-faint)]">
                            Usually under two minutes. You can close this tab — a failure still
                            refunds itself.
                          </p>
                        </div>
                      </div>
                    ) : job.output_url && job.status === 'completed' ? (
                      isVideoUrl(job.output_url) ? (
                        <video
                          src={job.output_url}
                          controls
                          playsInline
                          loop
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
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <Badge tone="muted">{job.tier}</Badge>
                        <Badge tone="muted">{job.cost_credits} cr</Badge>
                        {job.refunded ? (
                          <Badge tone="good">+{job.cost_credits} refunded</Badge>
                        ) : null}
                      </div>

                      <p className="line-clamp-2 text-sm text-[var(--color-muted)]">{job.prompt}</p>

                      {job.error_reason ? (
                        <p className="mt-2 text-sm text-[var(--color-yellow)]">
                          {job.error_reason}
                        </p>
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
    </div>
  );
}

/** Consent is only demanded where a likeness is actually involved. */
function consentSatisfied(spec: { likenessRisk: boolean; input: string }, consent: boolean) {
  return spec.likenessRisk || spec.input !== 'none' ? consent : true;
}
