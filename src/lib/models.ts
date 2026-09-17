/**
 * Model catalogue and scene presets.
 *
 * Every endpoint was read from docs.higgsfield.ai and then probed against this
 * account's live credentials (the probe table is in docs/HIGGSFIELD_NOTES.md).
 * Nothing here is recalled from memory, and routes that answer 404 for this
 * account are deliberately absent.
 *
 * The catalogue is small on purpose. The open-source reference studio exposes
 * 32 models behind one prompt bar, which is the right shape for a developer
 * with an API key. This is the other shape: a person who wants to see
 * themselves in a film and has never written a prompt. So the model is chosen
 * for them, and the interesting surface is the scene, not the sampler.
 *
 * Credits are the user-facing unit: 1 credit = $0.01, one flat rate, every pack.
 */

export type Tier = 'draft' | 'final';
export type MediaKind = 'image' | 'video';
export type TaskId =
  | 'star_in_it'
  | 'product_ad'
  | 'talking_character'
  | 'cinematic_shot'
  | 'animate_photo';

/** What a model needs fed to it, which decides what the UI asks for. */
export type InputKind = 'none' | 'start-image' | 'references';

export interface GenerationInput {
  prompt: string;
  aspectRatio: string;
  /** Single start frame, for image-to-video. */
  imageUrl?: string;
  /** Reference images — this is the face-input path. 1–30 per the docs. */
  imageUrls?: string[];
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
  /** Shown on the Generate button before the click. */
  credits: number;
  input: InputKind;
  maxReferences?: number;
  /** Roughly how long the provider takes; sets the timeout and refund deadline. */
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
  // ------------------------------------------------- faces → video (the hook) ---
  // Seedance 2.5 reference-to-video is the capability the Higgsfield API has
  // and other providers do not: real face inputs, available in the US.
  'seedance-2-ref-draft': {
    id: 'seedance-2-ref-draft',
    label: 'Seedance 2.0 cast (fast draft)',
    provider: 'ByteDance',
    endpoint: '/bytedance/seedance-2.0/reference-to-video',
    kind: 'video',
    tier: 'draft',
    credits: 40,
    input: 'references',
    maxReferences: 3,
    typicalSeconds: 180,
    buildBody: (input) => ({
      prompt: input.prompt,
      image_urls: input.imageUrls ?? [],
      resolution: '480p',
      duration: clampDuration(input.durationSeconds, 4, 15),
      aspect_ratio: pickAspect(input.aspectRatio, VIDEO_ASPECTS, '9:16'),
      generate_audio: input.withAudio,
    }),
  },
  'seedance-25-ref-final': {
    id: 'seedance-25-ref-final',
    label: 'Seedance 2.5 cast (final, 720p)',
    provider: 'ByteDance',
    endpoint: '/bytedance/seedance-2.5/reference-to-video',
    kind: 'video',
    tier: 'final',
    credits: 120,
    input: 'references',
    maxReferences: 3,
    typicalSeconds: 300,
    buildBody: (input) => ({
      prompt: input.prompt,
      image_urls: input.imageUrls ?? [],
      resolution: '720p',
      duration: clampDuration(input.durationSeconds, 4, 30),
      // The docs are explicit that reference-to-video needs an explicit ratio.
      aspect_ratio: pickAspect(input.aspectRatio, VIDEO_ASPECTS, '9:16'),
      generate_audio: input.withAudio,
      output_format: 'mp4',
    }),
  },

  // ---------------------------------------------------------------- images ---
  'soul-draft': {
    id: 'soul-draft',
    label: 'SOUL (fast draft)',
    provider: 'Higgsfield',
    endpoint: '/higgsfield-ai/soul/standard',
    kind: 'image',
    tier: 'draft',
    credits: 5,
    input: 'none',
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
    input: 'none',
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
    input: 'none',
    typicalSeconds: 60,
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
    input: 'none',
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
    input: 'none',
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
    input: 'none',
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
    input: 'none',
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
    input: 'start-image',
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
    input: 'start-image',
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

/**
 * A scene: one tap, no prompt writing.
 *
 * `{subject}` is replaced with how the subject should be referred to, which
 * differs between a cast job ("the person in the reference images") and a plain
 * text job ("a person"). This is what lets one preset list serve both.
 */
export interface ScenePreset {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  aspect: string;
  duration: number;
  audio: boolean;
  /** Two colours that stand in for the scene's palette until a preview exists. */
  tone: [string, string];
  /** Set once a real preview clip has been generated for this scene. */
  previewUrl?: string;
}

export const STAR_PRESETS: ScenePreset[] = [
  {
    id: 'neon-city',
    label: 'Neon city',
    hint: 'Rain-slick streets, shot from behind',
    prompt:
      'Cinematic tracking shot following {subject} walking through a rain-slick neon city street at night, reflections on wet asphalt, anamorphic lens flares, shallow depth of field, moody teal and magenta grade, film grain.',
    aspect: '9:16',
    duration: 5,
    audio: true,
    tone: ['#ff2bd6', '#1b0f4a']
  },
  {
    id: 'action-hero',
    label: 'Action hero',
    hint: 'Slow-motion, sparks, hero shot',
    prompt:
      'Blockbuster action hero shot of {subject} turning to camera in slow motion as embers drift past, dust and sparks in the air, hard key light with deep shadows, handheld energy, high contrast cinematic grade.',
    aspect: '9:16',
    duration: 5,
    audio: true,
    tone: ['#ff6a1f', '#2b0806']
  },
  {
    id: 'fashion',
    label: 'Fashion film',
    hint: 'Editorial, studio lighting',
    prompt:
      'High-fashion editorial film of {subject}, studio cyclorama, crisp beauty lighting with a soft rim, slow confident movement toward camera, 85mm lens, clean colour, magazine-grade styling.',
    aspect: '9:16',
    duration: 5,
    audio: false,
    tone: ['#f5f0e8', '#3a3a3a']
  },
  {
    id: 'eighties',
    label: '80s music video',
    hint: 'VHS grain, hot magenta',
    prompt:
      'Retro 1980s music video of {subject}, VHS grain and chromatic aberration, hot magenta and cyan practical lights, haze, slow push in, analogue video artefacts, nostalgic and stylised.',
    aspect: '9:16',
    duration: 5,
    audio: true,
    tone: ['#ff3cac', '#2b1055']
  },
  {
    id: 'noir',
    label: 'Film noir',
    hint: 'Venetian blinds, black and white',
    prompt:
      'Black and white film noir shot of {subject} lit through venetian blinds, cigarette smoke curling in a hard shaft of light, 1940s detective framing, deep blacks, slow deliberate camera move.',
    aspect: '9:16',
    duration: 5,
    audio: true,
    tone: ['#d9d9d9', '#0a0a0a']
  },
  {
    id: 'space',
    label: 'Space captain',
    hint: 'Bridge of a starship',
    prompt:
      'Science fiction shot of {subject} on the bridge of a starship, holographic displays casting soft blue light across their face, slow dolly in, lens flares, prestige sci-fi cinematography.',
    aspect: '9:16',
    duration: 5,
    audio: true,
    tone: ['#6fe9ff', '#04122e']
  },
  {
    id: 'western',
    label: 'Western',
    hint: 'Golden hour, wide desert',
    prompt:
      'Epic western shot of {subject} standing in a wide desert at golden hour, wind moving dust across frame, long lens compression, warm amber grade, anamorphic widescreen.',
    aspect: '16:9',
    duration: 5,
    audio: true,
    tone: ['#ffb347', '#3d1e08']
  },
  {
    id: 'red-carpet',
    label: 'Red carpet',
    hint: 'Flashbulbs, premiere night',
    prompt:
      'Red carpet premiere footage of {subject} at night, camera flashes popping around them, shallow focus, glamorous key light, subtle handheld movement, paparazzi energy.',
    aspect: '9:16',
    duration: 5,
    audio: true,
    tone: ['#ffd84a', '#2a0413']
  },
];

export interface TaskSpec {
  id: TaskId;
  title: string;
  blurb: string;
  /** One-line hint written for someone who has never prompted before. */
  placeholder: string;
  icon: 'star' | 'product' | 'character' | 'cinema' | 'photo';
  draftModel: string;
  finalModel: string;
  alternateFinals: string[];
  /** What the UI collects: nothing, one photo, or a set of face references. */
  input: InputKind;
  /** A face means a likeness, which means we ask for consent first. */
  likenessRisk: boolean;
  defaultAspect: string;
  defaultDuration: number;
  defaultAudio: boolean;
  /** Wrapped around the user's words so a plain sentence still looks directed. */
  promptPrefix: string;
  presets: ScenePreset[];
  /** How a preset should refer to the subject for this task. */
  subjectPhrase: string;
  featured?: boolean;
}

export const TASKS: Record<TaskId, TaskSpec> = {
  star_in_it: {
    id: 'star_in_it',
    title: 'Put yourself in it',
    blurb: 'Upload a selfie. Star in a cinematic scene.',
    placeholder: 'walking through a neon city at night, camera tracking behind',
    icon: 'star',
    draftModel: 'seedance-2-ref-draft',
    finalModel: 'seedance-25-ref-final',
    alternateFinals: [],
    input: 'references',
    likenessRisk: true,
    defaultAspect: '9:16',
    defaultDuration: 5,
    defaultAudio: true,
    promptPrefix: '',
    presets: STAR_PRESETS,
    subjectPhrase: 'the person in the reference images',
    featured: true,
  },
  product_ad: {
    id: 'product_ad',
    title: 'Product ad',
    blurb: 'A short, clean spot that makes one product look expensive.',
    placeholder: 'a matte black water bottle on wet stone, slow orbit, morning light',
    icon: 'product',
    draftModel: 'seedance-2-draft',
    finalModel: 'seedance-25-final',
    alternateFinals: ['kling-3-final', 'wan-3-final'],
    input: 'none',
    likenessRisk: false,
    defaultAspect: '9:16',
    defaultDuration: 5,
    defaultAudio: true,
    promptPrefix: 'Commercial product film, crisp studio lighting, shallow depth of field. ',
    presets: [],
    subjectPhrase: 'the product',
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
    input: 'none',
    likenessRisk: true,
    defaultAspect: '9:16',
    defaultDuration: 5,
    defaultAudio: true,
    promptPrefix:
      'Medium close-up, natural performance, synced speech, eye contact with camera. ',
    presets: [],
    subjectPhrase: 'a person',
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
    input: 'none',
    likenessRisk: false,
    defaultAspect: '16:9',
    defaultDuration: 5,
    defaultAudio: true,
    promptPrefix:
      'Cinematic, anamorphic, motivated camera move, film grain, graded highlights. ',
    presets: STAR_PRESETS,
    subjectPhrase: 'a person',
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
    input: 'start-image',
    likenessRisk: true,
    defaultAspect: '9:16',
    defaultDuration: 5,
    defaultAudio: false,
    promptPrefix: 'Subtle, believable motion that respects the original frame. ',
    presets: [],
    subjectPhrase: 'the subject',
  },
};

export const TASK_LIST: TaskSpec[] = [
  TASKS.star_in_it,
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
    if (model.input !== task.input) {
      throw new Error(`Model ${override} does not fit task ${taskId}`);
    }
    return model;
  }
  return getModel(tier === 'draft' ? task.draftModel : task.finalModel);
}

/** Fills a preset's {subject} slot for the task it is being used on. */
export function resolvePreset(preset: ScenePreset, taskId: TaskId): string {
  return preset.prompt.replace(/\{subject\}/g, TASKS[taskId].subjectPhrase);
}

/** The whole point of the draft tier: see it cheap before you buy it good. */
export function upgradeSavings(taskId: TaskId): { draft: number; final: number } {
  return {
    draft: getModel(TASKS[taskId].draftModel).credits,
    final: getModel(TASKS[taskId].finalModel).credits,
  };
}
