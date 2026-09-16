/**
 * 64-bit DCT perceptual hash.
 *
 * This is what makes complaint #4 enforceable: if a paid re-roll comes back
 * within a few bits of something the same user already paid for on the same
 * prompt, it is not a new output and we refund it.
 *
 * Pure JS on purpose -- no native module to break on a serverless build.
 */
import { decode as decodeJpeg } from 'jpeg-js';
import { decode as decodePng } from 'fast-png';

const SAMPLE = 32; // downsample grid
const LOW_FREQ = 8; // DCT block kept

export interface Bitmap {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array | Uint8ClampedArray;
}

export function detectImageType(bytes: Uint8Array): 'jpeg' | 'png' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  return null;
}

export function decodeImage(bytes: Uint8Array): Bitmap | null {
  const type = detectImageType(bytes);
  try {
    if (type === 'jpeg') {
      const out = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true });
      return { width: out.width, height: out.height, data: out.data };
    }
    if (type === 'png') {
      const out = decodePng(bytes);
      const channels = out.channels ?? 4;
      const source = out.data as Uint8Array | Uint16Array;
      const scale = out.depth === 16 ? 1 / 257 : 1;
      const rgba = new Uint8Array(out.width * out.height * 4);
      for (let i = 0; i < out.width * out.height; i += 1) {
        const s = i * channels;
        const r = Number(source[s]) * scale;
        const g = channels >= 3 ? Number(source[s + 1]) * scale : r;
        const b = channels >= 3 ? Number(source[s + 2]) * scale : r;
        const a = channels === 4 ? Number(source[s + 3]) * scale : channels === 2 ? Number(source[s + 1]) * scale : 255;
        rgba[i * 4] = r;
        rgba[i * 4 + 1] = g;
        rgba[i * 4 + 2] = b;
        rgba[i * 4 + 3] = a;
      }
      return { width: out.width, height: out.height, data: rgba };
    }
  } catch {
    return null;
  }
  return null;
}

/** Box-filtered downsample straight to luma, so aspect changes still line up. */
function toGrayGrid(bitmap: Bitmap, size: number): Float64Array {
  const grid = new Float64Array(size * size);
  const cellW = bitmap.width / size;
  const cellH = bitmap.height / size;

  for (let gy = 0; gy < size; gy += 1) {
    const y0 = Math.floor(gy * cellH);
    const y1 = Math.max(Math.floor((gy + 1) * cellH), y0 + 1);
    for (let gx = 0; gx < size; gx += 1) {
      const x0 = Math.floor(gx * cellW);
      const x1 = Math.max(Math.floor((gx + 1) * cellW), x0 + 1);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < Math.min(y1, bitmap.height); y += 1) {
        for (let x = x0; x < Math.min(x1, bitmap.width); x += 1) {
          const i = (y * bitmap.width + x) * 4;
          sum += 0.299 * bitmap.data[i] + 0.587 * bitmap.data[i + 1] + 0.114 * bitmap.data[i + 2];
          count += 1;
        }
      }
      grid[gy * size + gx] = count > 0 ? sum / count : 0;
    }
  }
  return grid;
}

function dct1d(input: Float64Array, size: number): Float64Array {
  const output = new Float64Array(size);
  for (let k = 0; k < size; k += 1) {
    let sum = 0;
    for (let n = 0; n < size; n += 1) {
      sum += input[n] * Math.cos((Math.PI * (2 * n + 1) * k) / (2 * size));
    }
    output[k] = sum * (k === 0 ? Math.SQRT1_2 : 1);
  }
  return output;
}

function dct2d(grid: Float64Array, size: number): Float64Array {
  const rows = new Float64Array(size * size);
  const row = new Float64Array(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) row[x] = grid[y * size + x];
    const transformed = dct1d(row, size);
    for (let x = 0; x < size; x += 1) rows[y * size + x] = transformed[x];
  }
  const out = new Float64Array(size * size);
  const col = new Float64Array(size);
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) col[y] = rows[y * size + x];
    const transformed = dct1d(col, size);
    for (let y = 0; y < size; y += 1) out[y * size + x] = transformed[y];
  }
  return out;
}

/** Returns 16 lowercase hex characters (64 bits), or null if undecodable. */
export function perceptualHash(bytes: Uint8Array): string | null {
  const bitmap = decodeImage(bytes);
  if (!bitmap || bitmap.width === 0 || bitmap.height === 0) return null;
  return perceptualHashFromBitmap(bitmap);
}

export function perceptualHashFromBitmap(bitmap: Bitmap): string {
  const grid = toGrayGrid(bitmap, SAMPLE);
  const freq = dct2d(grid, SAMPLE);

  const coefficients: number[] = [];
  for (let y = 0; y < LOW_FREQ; y += 1) {
    for (let x = 0; x < LOW_FREQ; x += 1) {
      if (x === 0 && y === 0) continue; // drop DC: it is just overall brightness
      coefficients.push(freq[y * SAMPLE + x]);
    }
  }

  const sorted = [...coefficients].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  // 63 coefficients plus a leading 0 pads the hash to a clean 64 bits.
  let bits = '0';
  for (const value of coefficients) bits += value > median ? '1' : '0';

  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

/** Same threshold the database uses in jv_find_duplicate. */
export const DUPLICATE_DISTANCE = 5;

export function isNearDuplicate(a: string, b: string, threshold = DUPLICATE_DISTANCE): boolean {
  return hammingDistance(a, b) <= threshold;
}
