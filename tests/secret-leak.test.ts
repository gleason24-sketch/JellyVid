/**
 * Greps the real production build for anything that must never reach a browser.
 *
 * A leaked provider key is a stranger spending the account's balance, so this
 * asserts against compiled output rather than against source discipline.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT_DIRS = ['.next/static'];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let clientBundle = '';
let clientFiles: string[] = [];

beforeAll(() => {
  if (!existsSync('.next/BUILD_ID')) {
    execSync('npm run build', { stdio: 'inherit', env: { ...process.env, HF_MOCK: '1' } });
  }
  clientFiles = CLIENT_DIRS.flatMap(walk).filter((file) => /\.(js|css|map|json)$/.test(file));
  clientBundle = clientFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
});

describe('no secret reaches the client bundle', () => {
  it('produced client assets to actually search', () => {
    expect(clientFiles.length).toBeGreaterThan(0);
    expect(clientBundle.length).toBeGreaterThan(1000);
  });

  it.each([
    ['HIGGSFIELD_API_KEY', 'HIGGSFIELD_API_KEY'],
    ['HF_API_KEY_SECRET', 'HF_API_KEY_SECRET'],
    ['JELLYVID_DB_SECRET', 'JELLYVID_DB_SECRET'],
    ['JELLYVID_SESSION_SECRET', 'JELLYVID_SESSION_SECRET'],
    ['JELLYVID_CRON_SECRET', 'JELLYVID_CRON_SECRET'],
    ['STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY'],
    ['SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'],
  ])('does not mention %s', (_label, name) => {
    expect(clientBundle).not.toContain(name);
  });

  it('contains no value that looks like a live key of any known shape', () => {
    const shapes: Array<[string, RegExp]> = [
      ['Stripe secret', /\bsk_(live|test)_[A-Za-z0-9]{16,}/],
      ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{16,}/],
      ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{16,}/],
      ['Supabase service-role JWT', /"?role"?\s*:\s*"service_role"/],
      ['Higgsfield credential pair', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{40,}/],
    ];
    for (const [label, pattern] of shapes) {
      expect(clientBundle, `${label} pattern found in the client bundle`).not.toMatch(pattern);
    }
  });

  it('does not ship the actual values from the current environment', () => {
    const live = [
      process.env.HIGGSFIELD_API_KEY,
      process.env.JELLYVID_DB_SECRET,
      process.env.JELLYVID_SESSION_SECRET,
      process.env.SUPABASE_ANON_KEY,
    ].filter((value): value is string => Boolean(value && value.length > 12));

    for (const value of live) {
      expect(clientBundle).not.toContain(value);
      // The halves of a "keyId:keySecret" pair must not leak separately either.
      for (const half of value.split(':')) {
        if (half.length > 16) expect(clientBundle).not.toContain(half);
      }
    }
  });

  it('keeps the provider base URL out of the client, so nothing calls it directly', () => {
    expect(clientBundle).not.toContain('api.higgsfield.ai');
  });

  it('marks every secret-reading module server-only', () => {
    for (const file of ['src/lib/env.ts', 'src/lib/db.ts', 'src/lib/higgsfield.ts', 'src/lib/session.ts', 'src/lib/jobs.ts', 'src/lib/storage.ts', 'src/lib/api.ts']) {
      expect(readFileSync(file, 'utf8'), `${file} is missing the server-only guard`).toMatch(
        /^import 'server-only';/m,
      );
    }
  });

  it('exposes no secret through a NEXT_PUBLIC_ variable', () => {
    const env = readFileSync('src/lib/env.ts', 'utf8');
    const publicVars = env.match(/NEXT_PUBLIC_[A-Z_]+/g) ?? [];
    // The site URL is the only thing the browser is allowed to know.
    expect([...new Set(publicVars)]).toEqual(['NEXT_PUBLIC_SITE_URL']);
  });
});
