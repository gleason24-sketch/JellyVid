/** Downscales the reel portrait PNG into a web-sized JPEG at public/reel/portrait.jpg. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decode } from 'fast-png';
import { encode as encodeJpeg } from 'jpeg-js';

const [, , input, outPath = 'public/reel/portrait.jpg', targetW = '720'] = process.argv;
const png = decode(readFileSync(input));
const ch = png.channels ?? 4;
const scale = png.depth === 16 ? 1 / 257 : 1;
const tw = Number(targetW);
const th = Math.round((png.height / png.width) * tw);
const out = Buffer.alloc(tw * th * 4);
const sx = png.width / tw, sy = png.height / th;

for (let y = 0; y < th; y++) {
  const y0 = Math.floor(y * sy), y1 = Math.max(Math.floor((y + 1) * sy), y0 + 1);
  for (let x = 0; x < tw; x++) {
    const x0 = Math.floor(x * sx), x1 = Math.max(Math.floor((x + 1) * sx), x0 + 1);
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y0; yy < Math.min(y1, png.height); yy++)
      for (let xx = x0; xx < Math.min(x1, png.width); xx++) {
        const i = (yy * png.width + xx) * ch;
        r += Number(png.data[i]) * scale; g += Number(png.data[i + 1]) * scale; b += Number(png.data[i + 2]) * scale; n++;
      }
    const o = (y * tw + x) * 4;
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
}
mkdirSync('public/reel', { recursive: true });
const jpeg = encodeJpeg({ data: out, width: tw, height: th }, 86);
writeFileSync(outPath, jpeg.data);
console.log(`${outPath} ${tw}x${th} ${(jpeg.data.length / 1024).toFixed(0)} KB`);
