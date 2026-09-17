/**
 * The demo reel: one synthetic portrait, cast into every scene preset.
 *
 * These clips were generated with Seedance 2.5 reference-to-video from a
 * single SOUL 2 portrait — the same path the studio uses — and they exist to
 * show, rather than claim, what face inputs do. The subject is synthetic; no
 * real person's likeness is involved.
 *
 * Files live in public/reel/<scene>.mp4 and are fetched by
 * scripts/fetch-reel.mjs from the generation job results.
 */
import { STAR_PRESETS, type ScenePreset } from './models';

export const REEL_PORTRAIT = '/reel/portrait.jpg';

export interface ReelClip {
  scene: ScenePreset;
  src: string;
}

/** Only scenes with a rendered clip; the order matches STAR_PRESETS. */
export const REEL: ReelClip[] = STAR_PRESETS.filter((scene) => scene.previewUrl).map((scene) => ({
  scene,
  src: scene.previewUrl as string,
}));

import type { GalleryItem } from '@/components/gallery-grid';

/**
 * The reel as gallery items. In demo mode this is the whole public gallery:
 * placeholder outputs are not real work and should not be shown as if they were.
 * Once real generation is on, user posts take over and these become the seeds
 * that keep the grid from ever being empty.
 */
export function reelAsGallery(): GalleryItem[] {
  return REEL.map(({ scene, src }) => ({
    share_slug: '',
    href: `/studio?task=star_in_it&scene=${scene.id}`,
    task: 'star_in_it',
    tier: 'final',
    kind: 'video',
    model_id: 'seedance-25-ref-final',
    prompt: scene.label,
    output_url: src,
    poster_url: null,
    created_at: new Date(0).toISOString(),
    autoplay: true,
  }));
}
