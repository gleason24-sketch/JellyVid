/**
 * Deterministic fixture image generator for HF_MOCK=1.
 *
 * Same seed in, byte-identical PNG out. That is what lets the duplicate-refund
 * test assert on a real perceptual hash collision rather than a stubbed one.
 */
import { encode as encodePng } from 'fast-png';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const SIZE = 256;

/** Neon blobs on a dark field: enough structure for a DCT hash to bite on. */
export function renderMockPng(seed: number): Uint8Array {
  const random = mulberry32(seed);
  const data = new Uint8Array(SIZE * SIZE * 4);

  const blobs = Array.from({ length: 5 }, () => ({
    x: random() * SIZE,
    y: random() * SIZE,
    r: 30 + random() * 70,
    cr: 80 + random() * 175,
    cg: 20 + random() * 120,
    cb: 120 + random() * 135,
  }));
  const tilt = random() * Math.PI;

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      const wave = 0.5 + 0.5 * Math.sin((x * Math.cos(tilt) + y * Math.sin(tilt)) / 14);
      let r = 8 + wave * 22;
      let g = 6 + wave * 10;
      let b = 18 + wave * 40;

      for (const blob of blobs) {
        const dx = x - blob.x;
        const dy = y - blob.y;
        const falloff = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / blob.r);
        const intensity = falloff * falloff;
        r += blob.cr * intensity;
        g += blob.cg * intensity;
        b += blob.cb * intensity;
      }

      data[i] = Math.min(255, r);
      data[i + 1] = Math.min(255, g);
      data[i + 2] = Math.min(255, b);
      data[i + 3] = 255;
    }
  }

  return encodePng({ width: SIZE, height: SIZE, data, channels: 4, depth: 8 });
}
