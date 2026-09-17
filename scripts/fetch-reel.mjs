/**
 * Pulls finished demo-reel clips into public/reel/ by scene id.
 *
 *   node scripts/fetch-reel.mjs reel.json
 *
 * reel.json: { "portrait": "<url>", "clips": { "<scene-id>": "<mp4 url>", ... } }
 *
 * Kept as a script so the reel can be regenerated later with a different
 * subject without touching application code.
 */
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('usage: node scripts/fetch-reel.mjs reel.json');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const out = join('public', 'reel');
mkdirSync(out, { recursive: true });

async function pull(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(join(out, file), bytes);
  const kb = (statSync(join(out, file)).size / 1024).toFixed(0);
  console.log(`${file.padEnd(18)} ${kb} KB`);
}

if (manifest.portrait) await pull(manifest.portrait, 'portrait.jpg');
for (const [scene, url] of Object.entries(manifest.clips ?? {})) {
  try {
    await pull(url, `${scene}.mp4`);
  } catch (error) {
    console.error(`skip ${scene}: ${error.message}`);
  }
}
