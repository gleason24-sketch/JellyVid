import { readFileSync, writeFileSync } from 'node:fs';
import { decode, encode } from 'fast-png';

function boxResize(src, w, h, tw, th) {
  const out = new Uint8Array(tw * th * 4);
  const sx = w / tw, sy = h / th;
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(Math.floor((y + 1) * sy), y0 + 1);
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(Math.floor((x + 1) * sx), x0 + 1);
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < Math.min(y1, h); yy++) {
        for (let xx = x0; xx < Math.min(x1, w); xx++) {
          const i = (yy * w + xx) * 4;
          const alpha = src[i + 3] / 255;
          // premultiply so transparent edges don't bleed dark
          r += src[i] * alpha; g += src[i + 1] * alpha; b += src[i + 2] * alpha; a += src[i + 3];
          n++;
        }
      }
      const o = (y * tw + x) * 4;
      const am = a / n;
      const un = am > 0 ? 255 / am : 0;
      out[o] = Math.min(255, (r / n) * un);
      out[o + 1] = Math.min(255, (g / n) * un);
      out[o + 2] = Math.min(255, (b / n) * un);
      out[o + 3] = am;
    }
  }
  return out;
}

function load(path) {
  const png = decode(readFileSync(path));
  const ch = png.channels ?? 4;
  const scale = png.depth === 16 ? 1 / 257 : 1;
  const rgba = new Uint8Array(png.width * png.height * 4);
  for (let i = 0; i < png.width * png.height; i++) {
    const s = i * ch;
    const r = Number(png.data[s]) * scale;
    const g = ch >= 3 ? Number(png.data[s + 1]) * scale : r;
    const b = ch >= 3 ? Number(png.data[s + 2]) * scale : r;
    const a = ch === 4 ? Number(png.data[s + 3]) * scale : ch === 2 ? Number(png.data[s + 1]) * scale : 255;
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { width: png.width, height: png.height, data: rgba };
}

/** Crop away fully-transparent margin so the mark fills its box. */
function trim(img) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return img;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    data.set(img.data.subarray(((y + minY) * img.width + minX) * 4, ((y + minY) * img.width + minX + w) * 4), y * w * 4);
  return { width: w, height: h, data };
}

/** Pad to square with transparency so aspect is preserved when resized. */
function square(img) {
  const s = Math.max(img.width, img.height);
  const data = new Uint8Array(s * s * 4);
  const ox = Math.floor((s - img.width) / 2), oy = Math.floor((s - img.height) / 2);
  for (let y = 0; y < img.height; y++)
    data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + oy) * s + ox) * 4);
  return { width: s, height: s, data };
}

const jobs = [
  { src: 'public/logo.png', trimIt: true, sizes: [[512, 'public/logo-512.png'], [256, 'public/logo-256.png'], [128, 'public/logo-128.png']] },
  { src: 'public/app-icon.png', trimIt: false, sizes: [[512, 'public/icon-512.png'], [192, 'public/icon-192.png'], [180, 'public/apple-touch-icon.png'], [64, 'public/icon-64.png'], [32, 'public/favicon-32.png']] },
];

for (const job of jobs) {
  let img = load(job.src);
  if (job.trimIt) img = square(trim(img));
  for (const [size, out] of job.sizes) {
    const data = boxResize(img.data, img.width, img.height, size, size);
    writeFileSync(out, encode({ width: size, height: size, data, channels: 4, depth: 8 }));
    console.log(out, size, (readFileSync(out).length / 1024).toFixed(1) + 'KB');
  }
}
