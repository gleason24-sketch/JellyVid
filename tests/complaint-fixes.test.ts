/**
 * One test per entry in the complaint -> fix map, named after the complaint it
 * closes. These cover the pure logic; the database guarantees and the full
 * pipeline are covered by tests/database.test.ts and the Playwright suite.
 */
import { describe, expect, it } from 'vitest';
import { CREDIT_PACKS, CENTS_PER_CREDIT, everyPackIsTheSameRate, creditsToUsd } from '@/lib/pricing';
import {
  MODELS,
  TASKS,
  TASK_LIST,
  modelForTask,
  resolvePreset,
  upgradeSavings,
} from '@/lib/models';
import { hammingDistance, isNearDuplicate, perceptualHashFromBitmap, DUPLICATE_DISTANCE } from '@/lib/phash';
import { renderMockPng } from '@/lib/mock-image';
import { perceptualHash } from '@/lib/phash';
import { rewriteSafely, looksLikePublicFigure, moderationReason } from '@/lib/moderation';
import { promptKey } from '@/lib/jobs';
import { extractOutput, isTerminal, TERMINAL_STATUSES } from '@/lib/higgsfield';
import { readForcedOutcome } from '@/lib/mock';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('complaint 1: credits expire or vanish at renewal', () => {
  it('has no expiry column, default or job anywhere in the schema', () => {
    const dir = 'supabase/migrations';
    const sql = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(join(dir, file), 'utf8'))
      .join('\n');

    // The guarantee is structural: there is nothing to expire against.
    expect(sql).not.toMatch(/expires_at\s+timestamptz/i);
    // (jv_stats reports a credits_expired counter; it is hard-coded to 0.)
    expect(sql).not.toMatch(/credits?_expiry|expire_credits|expiry_date/i);
    expect(sql).not.toMatch(/delete\s+from\s+jv_wallets/i);
    // A wallet's balance is only ever reduced by an explicit spend.
    expect(sql).not.toMatch(/balance_credits\s*=\s*0\b/);
  });

  it('reports never_expires on the wallet payload itself', () => {
    const dir = 'supabase/migrations';
    const sql = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(join(dir, file), 'utf8'))
      .join('\n');
    expect(sql).toMatch(/'never_expires',\s*true/);
    expect(sql).toMatch(/'expires_at',\s*null/);
  });
});

describe('complaint 2: confusing, shifting pricing and annual-plan dark patterns', () => {
  it('prices every pack at exactly the same rate', () => {
    expect(everyPackIsTheSameRate()).toBe(true);
    for (const pack of CREDIT_PACKS) {
      expect(pack.priceCents / pack.credits).toBe(CENTS_PER_CREDIT);
    }
  });

  it('offers no volume discount, so a bigger pack is never cheaper per credit', () => {
    const rates = CREDIT_PACKS.map((pack) => pack.priceCents / pack.credits);
    expect(new Set(rates).size).toBe(1);
  });

  it('sells no subscription products', () => {
    const ids = CREDIT_PACKS.map((pack) => pack.id).join(' ');
    expect(ids).not.toMatch(/month|year|annual|sub/i);
  });
});

describe('complaint 3: refunds ignore failed generations', () => {
  it('refunds every non-delivering terminal state in the same statement', () => {
    const sql = readFileSync('supabase/migrations/0002_functions.sql', 'utf8');
    const finalize = sql.slice(sql.indexOf('function jv_job_finalize'));

    for (const status of ['failed', 'nsfw', 'canceled', 'timeout', 'duplicate']) {
      expect(finalize).toContain(`'${status}'`);
    }
    expect(finalize).toMatch(/v_refund\s*:=\s*p_status in \('failed','nsfw','canceled','timeout','duplicate'\)/);
    expect(finalize).toMatch(/balance_credits\s*=\s*balance_credits \+ v_job\.cost_credits/);
  });

  it('cannot refund the same job twice', () => {
    const sql = readFileSync('supabase/migrations/0001_init.sql', 'utf8');
    expect(sql).toMatch(/unique index[\s\S]{0,120}jv_ledger \(job_id\) where kind = 'refund'/);
  });
});

describe('complaint 4: paid re-rolls return the same image', () => {
  it('gives an identical image a hamming distance of zero', () => {
    const a = perceptualHash(renderMockPng(1234));
    const b = perceptualHash(renderMockPng(1234));
    expect(a).not.toBeNull();
    expect(a).toBe(b);
    expect(hammingDistance(a as string, b as string)).toBe(0);
    expect(isNearDuplicate(a as string, b as string)).toBe(true);
  });

  it('keeps genuinely different images well outside the duplicate threshold', () => {
    const a = perceptualHash(renderMockPng(1));
    const b = perceptualHash(renderMockPng(999_999));
    expect(hammingDistance(a as string, b as string)).toBeGreaterThan(DUPLICATE_DISTANCE);
    expect(isNearDuplicate(a as string, b as string)).toBe(false);
  });

  it('produces a full 64-bit hash', () => {
    const hash = perceptualHash(renderMockPng(42));
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('survives a small brightness shift, which is what "perceptual" has to mean', () => {
    const size = 32;
    const base = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i += 1) {
      const value = (i * 7) % 256;
      base[i * 4] = value;
      base[i * 4 + 1] = value;
      base[i * 4 + 2] = value;
      base[i * 4 + 3] = 255;
    }
    const brighter = base.map((value, index) => (index % 4 === 3 ? value : Math.min(255, value + 6)));

    const a = perceptualHashFromBitmap({ width: size, height: size, data: base });
    const b = perceptualHashFromBitmap({ width: size, height: size, data: brighter });
    expect(hammingDistance(a, b)).toBeLessThanOrEqual(DUPLICATE_DISTANCE);
  });

  it('uses the same threshold in SQL as it does in TypeScript', () => {
    const sql = readFileSync('supabase/migrations/0002_functions.sql', 'utf8');
    expect(sql).toMatch(/p_distance integer default 5/);
    expect(DUPLICATE_DISTANCE).toBe(5);
  });

  it('groups duplicates by a normalised prompt, ignoring case and punctuation', () => {
    expect(promptKey('product_ad', 'A Matte  Black Bottle!')).toBe(
      promptKey('product_ad', 'a matte black bottle'),
    );
    expect(promptKey('product_ad', 'a bottle')).not.toBe(promptKey('cinematic_shot', 'a bottle'));
  });
});

describe('complaint 5: false or opaque NSFW blocks', () => {
  it('explains a block in plain English rather than a code', () => {
    const reason = moderationReason('nsfw');
    expect(reason).toMatch(/cost you nothing/i);
    expect(reason).not.toMatch(/error|code|\d{3}/i);
  });

  it('rewrites an unsafe prompt into a usable one and says what it changed', () => {
    const result = rewriteSafely('a nude figure holding a gun, bloody scene');
    expect(result.changed).toBe(true);
    expect(result.prompt).not.toMatch(/nude|gun|bloody/i);
    expect(result.notes.length).toBeGreaterThan(0);
    // The user's actual subject has to survive the rewrite.
    expect(result.prompt).toMatch(/figure/);
  });

  it('refuses a real public figure before any credit is spent', () => {
    expect(looksLikePublicFigure('a photo of taylor swift on stage')).toBe(true);
    expect(looksLikePublicFigure('a photo of a singer on stage')).toBe(false);
    expect(rewriteSafely('taylor swift on stage').prompt).toMatch(/original fictional character/);
  });
});

describe('complaint 6: convoluted, carnival UI', () => {
  it('keeps the task list short and fixed, with the hero first', () => {
    // A short fixed list, not a model grid. Five is the ceiling we hold to.
    expect(TASK_LIST.length).toBeLessThanOrEqual(5);
    expect(TASK_LIST[0].id).toBe('star_in_it');
    expect(TASK_LIST.map((task) => task.id)).toEqual([
      'star_in_it',
      'product_ad',
      'talking_character',
      'cinematic_shot',
      'animate_photo',
    ]);
  });

  it('lets someone generate without writing a prompt at all', () => {
    // Presets are the no-prompt path: pick a look, get a directed shot.
    const star = TASKS.star_in_it;
    expect(star.presets.length).toBeGreaterThanOrEqual(6);
    for (const preset of star.presets) {
      const resolved = resolvePreset(preset, 'star_in_it');
      expect(resolved).not.toContain('{subject}');
      expect(resolved).toContain('the person in the reference images');
      expect(resolved.length).toBeGreaterThan(80);
    }
  });

  it('picks the model for you, so no choice is required to start', () => {
    for (const task of TASK_LIST) {
      expect(modelForTask(task.id, 'draft').id).toBe(task.draftModel);
      expect(modelForTask(task.id, 'final').id).toBe(task.finalModel);
    }
  });

  it('writes every task blurb for someone who has never prompted before', () => {
    for (const task of TASK_LIST) {
      expect(task.placeholder.length).toBeGreaterThan(10);
      expect(task.blurb).not.toMatch(/latent|diffusion|checkpoint|cfg|sampler/i);
    }
  });
});

describe('complaint 7: low keeper rate burns money', () => {
  it('always makes the draft materially cheaper than the final', () => {
    for (const task of TASK_LIST) {
      const { draft, final } = upgradeSavings(task.id);
      expect(draft).toBeLessThan(final);
      expect(draft / final).toBeLessThanOrEqual(0.5);
    }
  });

  it('routes the final tier to the premium model where one exists', () => {
    expect(TASKS.cinematic_shot.finalModel).toBe('seedance-25-final');
    expect(MODELS['seedance-25-final'].endpoint).toBe('/bytedance/seedance-2.5/text-to-video');
  });

  it('refuses a model that cannot feed the chosen task', () => {
    // animate_photo needs a start image; a text-to-video model cannot serve it.
    expect(() => modelForTask('animate_photo', 'final', 'seedance-25-final')).toThrow();
    expect(() => modelForTask('cinematic_shot', 'final', 'seedance-25-i2v-final')).toThrow();
    // A cast job needs reference inputs, which a plain t2v model does not take.
    expect(() => modelForTask('star_in_it', 'final', 'seedance-25-final')).toThrow();
  });
});

describe('complaint 8: silent failures and rate limits', () => {
  it('treats exactly the documented provider states as terminal', () => {
    expect(TERMINAL_STATUSES).toEqual(['completed', 'failed', 'nsfw', 'canceled']);
    expect(isTerminal('in_progress')).toBe(false);
    expect(isTerminal('queued')).toBe(false);
    expect(isTerminal('nsfw')).toBe(true);
  });

  it('reads an output URL out of every media shape the API documents', () => {
    expect(extractOutput({ images: [{ url: 'https://x/i.jpg' }] }).outputUrl).toBe('https://x/i.jpg');
    expect(extractOutput({ video: { url: 'https://x/v.mp4' } }).outputUrl).toBe('https://x/v.mp4');
    expect(extractOutput({ audio: { url: 'https://x/a.mp3' } }).outputUrl).toBe('https://x/a.mp3');
    expect(extractOutput({}).outputUrl).toBeUndefined();
  });

  it('never auto-retries a submission, which has no idempotency key', () => {
    const source = readFileSync('src/lib/higgsfield.ts', 'utf8');
    const submitBody = source.slice(source.indexOf('export async function submit'));
    expect(submitBody).toMatch(/retries:\s*0/);
  });

  it('retries status reads, which are safe to repeat', () => {
    const source = readFileSync('src/lib/higgsfield.ts', 'utf8');
    const statusBody = source.slice(source.indexOf('export async function getStatus'));
    expect(statusBody).toMatch(/retries:\s*[1-9]/);
  });
});

describe('complaint 9: hard to cancel or get money back', () => {
  it('files a payout request and hands back a prefilled support email', () => {
    const source = readFileSync('src/app/api/payout/route.ts', 'utf8');
    expect(source).toMatch(/mailto:/);
    expect(source).toMatch(/jv_payout_request/);
    // The email arrives with the account details already filled in.
    expect(source).toMatch(/Wallet: \$\{user\.id\}/);
  });

  it('has no retention flow between the user and the request', () => {
    const source = readFileSync('src/components/wallet-view.tsx', 'utf8');
    expect(source).not.toMatch(/are you sure|before you go|special offer|discount/i);
  });
});

describe('complaint 10: cost surprise', () => {
  it('puts the exact credit cost on the generate button', () => {
    const source = readFileSync('src/components/studio.tsx', 'utf8');
    expect(source).toMatch(/Generate: \$\{cost\} credits/);
  });

  it('recomputes the price server-side and refuses a mismatch', async () => {
    const source = readFileSync('src/lib/jobs.ts', 'utf8');
    expect(source).toMatch(/quotedCredits !== undefined && input\.quotedCredits !== cost/);
    expect(source).toMatch(/price_mismatch/);
    // Crucially, the refusal happens before any credit is debited: the
    // mismatch check precedes the call site that performs the spend.
    const spendCall = source.indexOf("call<CreateJobResult>('jv_job_create'");
    expect(spendCall).toBeGreaterThan(-1);
    expect(source.indexOf('price_mismatch')).toBeLessThan(spendCall);
  });

  it('prices every model in whole credits, so the button never shows a fraction', () => {
    for (const model of Object.values(MODELS)) {
      expect(Number.isInteger(model.credits)).toBe(true);
      expect(model.credits).toBeGreaterThan(0);
    }
    expect(creditsToUsd(40)).toBe('$0.40');
  });
});

describe('mock harness', () => {
  it('reads forced outcomes from prompt markers so tests can demand a failure', () => {
    expect(readForcedOutcome('a cat [[force:fail]]')).toBe('fail');
    expect(readForcedOutcome('a cat [[force:nsfw]]')).toBe('nsfw');
    expect(readForcedOutcome('a cat')).toBe('ok');
  });
});

describe('face inputs — the capability this is built around', () => {
  it('routes the cast task to Seedance reference-to-video on both tiers', () => {
    expect(MODELS[TASKS.star_in_it.draftModel].endpoint).toBe(
      '/bytedance/seedance-2.0/reference-to-video',
    );
    expect(MODELS[TASKS.star_in_it.finalModel].endpoint).toBe(
      '/bytedance/seedance-2.5/reference-to-video',
    );
  });

  it('sends references as image_urls, with the explicit aspect ratio the docs require', () => {
    const model = MODELS['seedance-25-ref-final'];
    const body = model.buildBody({
      prompt: 'walking through neon rain',
      aspectRatio: '9:16',
      imageUrls: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
      durationSeconds: 5,
      withAudio: true,
    });
    expect(body.image_urls).toEqual(['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg']);
    expect(body.aspect_ratio).toBe('9:16');
    expect(body.resolution).toBe('720p');
    // Reference-to-video takes no single image_url; sending one is a 422.
    expect(body.image_url).toBeUndefined();
  });

  it('clamps duration into the range each model documents', () => {
    const final = MODELS['seedance-25-ref-final'].buildBody({
      prompt: 'x',
      aspectRatio: '9:16',
      imageUrls: ['https://cdn.example/a.jpg'],
      durationSeconds: 999,
      withAudio: true,
    });
    expect(final.duration).toBe(30); // 2.5 allows 4-30

    const draft = MODELS['seedance-2-ref-draft'].buildBody({
      prompt: 'x',
      aspectRatio: '9:16',
      imageUrls: ['https://cdn.example/a.jpg'],
      durationSeconds: 999,
      withAudio: true,
    });
    expect(draft.duration).toBe(15); // 2.0 allows 4-15
  });

  it('treats every face task as a likeness, so consent is always demanded', () => {
    for (const task of TASK_LIST) {
      if (task.input !== 'none') expect(task.likenessRisk).toBe(true);
    }
  });
});
