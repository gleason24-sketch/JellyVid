/**
 * Model catalog.
 *
 * Every endpoint below was read from docs.higgsfield.ai and then probed against
 * this account's live credentials (see docs/HIGGSFIELD_NOTES.md for the probe
 * table). Nothing here is recalled from memory. `nano-banana` and the legacy
 * `bytedance/seedance/v1/*` routes are deliberately absent: they answer
 * 404 model_not_found for this account.
 *
 * Credits are the user-facing unit: 1 credit = $0.01, one flat rate, every pack.
 */

export type Tier = 'draft' | 'final';
export type MediaKind = 'image' | 'video';
export type TaskId = 'product_ad' | 'talking_character' | 'cinematic_shot' | 'animate_photo';

export interface GenerationInput {
  prompt: string;
  aspectRatio: string;
  imageUrl?: string;
  durationSeconds: number;
  withAudio: boolean;
  seed?: number;
}

export interface ModelSpec {
  id: string;
  label: string;
  provider: string;
  /** Path appended to https://api.higgsfield.ai */
  endpoint: string;
  kind: MediaKind;
  tier: Tier;
  /** Shown on the Generate button before the click. Complaint #10. */
  credits: number;
  requiresImage: boolean;
  /** Roughly how long the provider takes, used for the timeout + refund deadline. */
  typicalSeconds: number;
  buildBody: (input: GenerationInput) => Record<string, unknown>;
}

const VIDEO_ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
const IMAGE_ASPECTS = ['9:16', '16:9', '4:3', '3:4', '1:1', '2:3', '3:2'];

function clampDuration(seconds: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(seconds), min), max);
}

function pickAspect(requested: string, allowed: string[], fallback: string): string {
  return allowed.includes(requested) ? requested : fallback;
}

export const MODELS: Record<string, ModelSpec> = {
  // ---------------------------------------------------------------- images ---
  'soul-draft': {
    id: 'soul-draft',
    label: 'SOUL (fast draft)',
    provider: 'Higgsfield',
    endpoint: '/higgsfield-ai/soul/standard',
    kind: 'image',
    tier: 'draft',
    credits: 5,
    requiresImage: false,
    typicalSeconds: 45,
    buildBody: (input) => ({
      prompt: input.prompt,
      aspect_ratio: pickAspect(input.aspectRatio, IMAGE_ASPECTS, '4:3'),
      batch_size: 1,
      enhance_prompt: true,
      ...(input.seed ? { seed: input.seed } : {}),
    }),
  },
  'soul-2-final': {
    id: 'soul-2-final',
    label: 'SOUL 2 (final, 1080p)',
    provider: 'Higgsfield',
    endpoint: '/higgsfield-ai/soul/v2/standard',
    kind: 'image',
    tier: 'final',
    credits: 15,
    requiresImage: false,
    typicalSeconds: 75,
    buildBody: (input) => ({
      prompt: input.prompt,
      aspect_ratio: pickAspect(input.aspectRatio, IMAGE_ASPECTS, '4:3'),
      resolution: '1080p',
      batch_size: 1,
      enhance_prompt: true,
      ...(input.seed ? { seed: input.seed } : {}),
    }),
  },
  'recraft-final': {
    id: 'recraft-final',
    label: 'Recraft v4.1 Pro (final)',
    provider: 'Recraft',
    endpoint: '/recraft/v4.1/pro/text-to-image',
    kind: 'image',
    tier: 'final',
    credits: 15,
    requiresImage: false,
    typicalSeconds: 60,
    buildBody: (input) => ({ prompt: input.prompt }),
  },
  'marketing-studio-final': {
    id: 'marketing-studio-final',
    label: 'Marketing Studio (final)',
    provider: 'Higgsfield',
    endpoint: '/marketing-studio/image',
    kind: 'image',
    tier: 'final',
    credits: 15,
    requiresImage: false,
    typicalSeconds: 75,
    buildBody: (input) => ({ prompt: input.prompt }),
  },

  // ---------------------------------------------------------------- videos ---
  'seedance-2-draft': {
    id: 'seedance-2-draft',
    label: 'Seedance 2.0 (fast draft, 480p)',
    provider: 'ByteDance',
    endpoint: '/bytedance/seedance-2.0/text-to-video',
    kind: 'video',
    tier: 'draft',
    credits: 40,
    requiresImage: false,
    typicalSeconds: 180,
    buildBody: (input) => ({
      prompt: input.prompt,
      resolution: '480p',
      duration: clampDuration(input.durationSeconds, 4, 15),
      aspect_ratio: pickAspect(input.aspectRatio, VIDEO_ASPECTS, '16:9'),
      generate_audio: input.withAudio,
    }),
  },
  'seedance-25-final': {
    id: 'seedance-25-final',
    label: 'Seedance 2.5 (final, 720p)',
    provider: 'ByteDance',
    endpoint: '/bytedance/seedance-2.5/text-to-video',
    kind: 'video',
    tier: 'final',
    credits: 120,
    requiresImage: false,
    typicalSeconds: 300,
    buildBody: (input) => ({
      prompt: input.prompt,
      resolution: '720p',
      duration: clampDuration(input.durationSeconds, 4, 30),
      aspect_ratio: pickAspect(input.aspectRatio, VIDEO_ASPECTS, '16:9'),
      generate_audio: input.withAudio,
      output_format: 'mp4',
    }),
  },
  'kling-3-final': {
    id: 'kling-3-final',
    label: 'Kling 3.0 Standard (final)',
    provider: 'Kuaishou',
    endpoint: '/kling-video/v3.0/std/text-to-video',
    kind: 'video',
    tier: 'final',
    credits: 120,
    requiresImage: false,
    typicalSeconds: 300,
    buildBody: (input) => ({
      prompt: input.prompt,
      duration: clampDuration(input.durationSeconds, 5, 10),
      aspect_ratio: pickAspect(input.aspectRatio, VIDEO_ASPECTS, '16:9'),
    }),
  },
  'wan-3-final': {
    id: 'wan-3-final',
    label: 'Wan 3.0 (final)',
    provider: 'Alibaba',
    endpoint: '/alibaba/wan-3.0/text-to-video',
    kind: 'video',
    tier: 'final',
    credits: 120,
    requiresImage: false,
    typicalSeconds: 300,
    buildBody: (input) => ({
      prompt: input.prompt,
      duration: clampDuration(input.durationSeconds, 4, 10),
      aspect_ratio: pickAspect(input.aspectRatio, VIDEO_ASPECTS, '16:9'),
    }),
  },

  // -------------------------------------------------------- image to video ---
  'seedance-2-i2v-draft': {
    id: 'seedance-2-i2v-draft',
    label: 'Seedance 2.0 animate (fast draft)',
    provider: 'ByteDance',
    endpoint: '/bytedance/seedance-2.0/image-to-video',
    kind: 'video',
    tier: 'draft',
    credits: 40,
    requiresImage: true,
    typicalSeconds: 180,
    buildBody: (input) => ({
      prompt: input.prompt,
      image_url: input.imageUrl,
      resolution: '480p',
      duration: clampDuration(input.durationSeconds, 4, 15),
      generate_audio: input.withAudio,
    }),
  },
  'seedance-25-i2v-final': {
    id: 'seedance-25-i2v-final',
    label: 'Seedance 2.5 animate (final, 720p)',
    provider: 'ByteDance',
    endpoint: '/bytedance/seedance-2.5/image-to-video',
    kind: 'video',
    tier: 'final',
    credits: 120,
    requiresImage: true,
    typicalSeconds: 300,
    buildBody: (input) => ({
      prompt: input.prompt,
      image_url: input.imageUrl,
      resolution: '720p',
      duration: clampDuration(input.durationSeconds, 4, 30),
      generate_audio: input.withAudio,
      output_format: 'mp4',
    }),
  },
};

export interface TaskSpec {
  id: TaskId;
  title: string;
  blurb: string;
  /** One-line hint written for someone who has never prompted before. */
  placeholder: string;
  icon: 'product' | 'character' | 'cinema' | 'photo';
  draftModel: string;
  finalModel: string;
  alternateFinals: string[];
  needsUpload: boolean;
  /** A face means a likeness, which means we ask for consent first. */
  likenessRisk: boolean;
  defaultAspect: string;
  defaultDuration: number;
  defaultAudio: boolean;
  /** Wrapped around the user's words so a plain sentence still looks directed. */
  promptPrefix: string;
}

export const TASKS: Record<TaskId, TaskSpec> = {
  product_ad: {
    id: 'product_ad',
    title: 'Product ad',
    blurb: 'A short, clean spot that makes one product look expensive.',
    placeholder: 'a matte black water bottle on wet stone, slow orbit, morning light',
    icon: 'product',
    draftModel: 'seedance-2-draft',
    finalModel: 'seedance-25-final',
    alternateFinals: ['kling-3-final', 'wan-3-final'],
    needsUpload: false,
    likenessRisk: false,
    defaultAspect: '9:16',
    defaultDuration: 5,
    defaultAudio: true,
    promptPrefix: 'Commercial product film, crisp studio lighting, shallow depth of field. ',
  },
  talking_character: {
    id: 'talking_character',
    title: 'Talking character',
    blurb: 'A person on camera, speaking, with sound.',
    placeholder: 'a friendly barista in an apron says "we open at six" to camera',
    icon: 'character',
    draftModel: 'seedance-2-draft',
    finalModel: 'seedance-25-final',
    alternateFinals: ['kling-3-final'],
    needsUpload: false,
    likenessRisk: true,
    defaultAspect: '9:16',
    defaultDuration: 5,
    defaultAudio: true,
    promptPrefix: 'Medium close-up, natural performance, synced speech, eye contact with camera. ',
  },
  cinematic_shot: {
    id: 'cinematic_shot',
    title: 'Cinematic shot',
    blurb: 'One beautiful moving shot, the kind that opens a film.',
    placeholder: 'a lone figure walks a neon-wet street at night, camera tracks behind',
    icon: 'cinema',
    draftModel: 'seedance-2-draft',
    finalModel: 'seedance-25-final',
    alternateFinals: ['wan-3-final', 'kling-3-final'],
    needsUpload: false,
    likenessRisk: false,
    defaultAspect: '16:9',
    defaultDuration: 5,
    defaultAudio: true,
    promptPrefix: 'Cinematic, anamorphic, motivated camera move, film grain, graded highlights. ',
  },
  animate_photo: {
    id: 'animate_photo',
    title: 'Animate a photo',
    blurb: 'Upload a still. Get it moving.',
    placeholder: 'gentle push in, hair moves in the breeze, subject blinks',
    icon: 'photo',
    draftModel: 'seedance-2-i2v-draft',
    finalModel: 'seedance-25-i2v-final',
    alternateFinals: [],
    needsUpload: true,
    likenessRisk: true,
    defaultAspect: '9:16',
    defaultDuration: 5,
    defaultAudio: false,
    promptPrefix: 'Subtle, believable motion that respects the original frame. ',
  },
};

export const TASK_LIST: TaskSpec[] = [
  TASKS.product_ad,
  TASKS.talking_character,
  TASKS.cinematic_shot,
  TASKS.animate_photo,
];

export function getModel(id: string): ModelSpec {
  const model = MODELS[id];
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model;
}

export function modelForTask(taskId: TaskId, tier: Tier, override?: string): ModelSpec {
  const task = TASKS[taskId];
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  if (override) {
    const model = getModel(override);
    // An override may not smuggle in a model the task cannot actually feed.
    if (model.requiresImage !== TASKS[taskId].needsUpload) {
      throw new Error(`Model ${override} does not fit task ${taskId}`);
    }
    return model;
  }
  return getModel(tier === 'draft' ? task.draftModel : task.finalModel);
}

/** The whole point of the draft tier: see it cheap before you buy it good. */
export function upgradeSavings(taskId: TaskId): { draft: number; final: number } {
  return {
    draft: getModel(TASKS[taskId].draftModel).credits,
    final: getModel(TASKS[taskId].finalModel).credits,
  };
}
