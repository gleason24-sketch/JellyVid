/**
 * The whole funnel, on a phone viewport, against local fixtures.
 *
 * Covers: first visit, free credits granted without a signup, a draft
 * generation, upgrade to final, a forced failure that auto-refunds, a
 * moderation block that costs nothing, a duplicate that auto-refunds, an
 * abandoned job that the sweep refunds, the public share page, and /stats.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const DRAFT_COST = 40;
const FINAL_COST = 120;
const SIGNUP_GRANT = 200;

async function balance(request: APIRequestContext): Promise<number> {
  const response = await request.get('/api/session');
  const body = (await response.json()) as { user: { wallet: { balance_credits: number } } | null };
  return body.user?.wallet.balance_credits ?? 0;
}

/** Fires a generation through the API using the page's own session cookie. */
async function generate(
  request: APIRequestContext,
  prompt: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await request.post('/api/generate', {
    data: {
      task: 'cinematic_shot',
      tier: 'draft',
      prompt,
      quotedCredits: DRAFT_COST,
      ...overrides,
    },
  });
  return { status: response.status(), body: await response.json() };
}

/** Same as generate(), but fails loudly with the server's reason attached. */
async function generateOk(
  request: APIRequestContext,
  prompt: string,
  overrides: Record<string, unknown> = {},
) {
  const result = await generate(request, prompt, overrides);
  if (result.status !== 200 || !result.body?.job) {
    throw new Error(
      `generate failed: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`,
    );
  }
  return result;
}

async function settle(request: APIRequestContext, jobId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get(`/api/jobs/${jobId}`);
    const body = (await response.json()) as {
      job?: { status: string; refunded: boolean };
      wallet: { balance_credits: number };
      error?: string;
    };
    if (!body.job) {
      throw new Error(
        `polling job ${jobId} failed: HTTP ${response.status()} ${JSON.stringify(body).slice(0, 300)}`,
      );
    }
    if (!['queued', 'in_progress'].includes(body.job.status)) {
      return body as { job: { status: string; refunded: boolean }; wallet: { balance_credits: number } };
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`job ${jobId} never settled`);
}

test.describe('landing page', () => {
  test('leads with the promises and needs no signup to start', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('money');
    await expect(page.getByRole('heading', { name: 'Credits never expire' })).toBeVisible();
    await expect(page.getByText(`${SIGNUP_GRANT} free credits`).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Make something free' })).toBeVisible();
  });

  test('has no horizontal scroll on a phone', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('states the flat rate on the pricing page and never pre-checks a box', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('One rate');
    const checked = await page.locator('input[type=checkbox]:checked').count();
    expect(checked).toBe(0);
    await expect(page.getByText('No subscriptions', { exact: false })).toBeVisible();
  });
});

test.describe('generation funnel', () => {
  test('signup grants free credits, a draft spends them, and the final upgrade works', async ({
    page,
  }) => {
    await page.goto('/studio');
    await expect(page.getByRole('heading', { name: 'What are you making?' })).toBeVisible();

    // The price is on the button before anything is clicked.
    await page.getByRole('button', { name: 'Cinematic shot' }).click();
    await page.getByLabel('Describe it in plain words').fill('a lone figure on a neon-wet street');
    const generateButton = page.getByRole('button', { name: `Generate: ${DRAFT_COST} credits` });
    await expect(generateButton).toBeVisible();

    await generateButton.click();

    // Free credits were granted and the draft was charged, with no signup step.
    await expect(page.getByText('Save your recovery code')).toBeVisible();
    await expect(page.getByText('Never expires').first()).toBeVisible();

    const card = page.locator('article').first();
    await expect(card.getByText('Done')).toBeVisible({ timeout: 60_000 });
    await expect(card.locator('img, video')).toBeVisible();

    // page.request shares the page's cookie jar; the standalone `request`
    // fixture has its own and would report a different (empty) wallet.
    const afterDraft = await balance(page.request);
    expect(afterDraft).toBe(SIGNUP_GRANT - DRAFT_COST);

    // Draft, then final: one click promotes it to the premium model.
    await card.getByRole('button', { name: `Make it final: ${FINAL_COST} credits` }).click();

    // Wait for the new card to actually appear before asserting on it --
    // otherwise `.first()` is still the draft, which already reads "Done".
    await expect(page.locator('article')).toHaveCount(2, { timeout: 60_000 });
    const finalCard = page.locator('article').first();
    await expect(finalCard.getByText('final', { exact: true })).toBeVisible();
    await expect(finalCard.getByText('Done')).toBeVisible({ timeout: 60_000 });

    expect(await balance(page.request)).toBe(SIGNUP_GRANT - DRAFT_COST - FINAL_COST);
  });

  test('a failed generation refunds itself', async ({ request }) => {
    await request.post('/api/session');
    const before = await balance(request);

    const { body } = await generateOk(request, 'a rainy alley [[force:fail]]');
    const settled = await settle(request, body.job.id);

    expect(settled.job.status).toBe('failed');
    expect(settled.job.refunded).toBe(true);
    expect(settled.wallet.balance_credits).toBe(before); // net zero
  });

  test('a moderation block costs nothing and offers a safe rewrite', async ({ request }) => {
    await request.post('/api/session');
    const before = await balance(request);

    const { body } = await generateOk(request, 'a quiet harbour [[force:nsfw]]');
    const settled = await settle(request, body.job.id);

    expect(settled.job.status).toBe('nsfw');
    expect(settled.wallet.balance_credits).toBe(before);

    const rewrite = await request.post('/api/rewrite', {
      data: { prompt: 'a nude figure holding a gun' },
    });
    const rewritten = (await rewrite.json()) as { prompt: string; notes: string[] };
    expect(rewritten.prompt).not.toMatch(/nude|gun/i);
    expect(rewritten.notes.length).toBeGreaterThan(0);
  });

  test('a duplicate output refunds itself', async ({ request }) => {
    await request.post('/api/session');
    const prompt = 'a matte black bottle on wet stone [[force:duplicate]]';

    const first = await generateOk(request, prompt, { task: 'product_ad' });
    const firstSettled = await settle(request, first.body.job.id);
    expect(firstSettled.job.status).toBe('completed');

    const before = firstSettled.wallet.balance_credits;
    const second = await generateOk(request, prompt, { task: 'product_ad' });
    const secondSettled = await settle(request, second.body.job.id);

    expect(secondSettled.job.status).toBe('duplicate');
    expect(secondSettled.job.refunded).toBe(true);
    expect(secondSettled.wallet.balance_credits).toBe(before);
  });

  test('an abandoned job is timed out and refunded by the sweep', async ({ request }) => {
    await request.post('/api/session');
    const before = await balance(request);

    const { body } = await generateOk(request, 'this one hangs [[force:timeout]]');
    expect(body.job.status).toBe('in_progress');

    // Simulate the tab closing: nobody polls, the deadline passes, cron sweeps.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const sweep = await request.post(
      `/api/reconcile?key=${process.env.JELLYVID_CRON_SECRET ?? ''}`,
    );
    expect(sweep.ok()).toBeTruthy();

    const settled = await settle(request, body.job.id);
    expect(settled.job.status).toBe('timeout');
    expect(settled.job.refunded).toBe(true);
    expect(settled.wallet.balance_credits).toBe(before);
  });

  test('the price on the button is the only price that can be charged', async ({ request }) => {
    await request.post('/api/session');
    const before = await balance(request);

    const cheated = await generate(request, 'trying to pay less', { quotedCredits: 1 });
    expect(cheated.status).toBe(400);
    expect(cheated.body.code).toBe('price_mismatch');
    expect(await balance(request)).toBe(before); // nothing moved
  });

  test('a likeness task will not run without consent', async ({ request }) => {
    await request.post('/api/session');
    const before = await balance(request);

    const refused = await generate(request, 'a barista talks to camera', {
      task: 'talking_character',
    });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('consent_required');
    expect(await balance(request)).toBe(before);
  });
});

test.describe('sharing and proof', () => {
  test('a finished output gets a public share page that invites the next person', async ({
    page,
    request,
  }) => {
    await request.post('/api/session');
    const { body } = await generateOk(request, 'a share-page subject, softly lit');
    await settle(request, body.job.id);

    const shared = await request.post(`/api/jobs/${body.job.id}/share`);
    const { url } = (await shared.json()) as { url: string };
    expect(url).toMatch(/^\/s\/[0-9a-f]{12}$/);

    // The share page must work for a stranger with no session at all.
    const context = await page.context().browser()?.newContext();
    const anonymous = await (context ?? page.context()).newPage();
    await anonymous.goto(url);
    await expect(anonymous.getByRole('heading', { name: 'Made with JellyVid' })).toBeVisible();
    await expect(anonymous.getByRole('link', { name: 'Make yours' })).toBeVisible();
    await anonymous.close();
    await context?.close();
  });

  test('/stats reports live counts including credits refunded', async ({ page, request }) => {
    const api = await request.get('/api/stats');
    const stats = (await api.json()) as {
      users: number;
      generations: number;
      credits_refunded: number;
      credits_expired: number;
    };
    expect(stats.generations).toBeGreaterThan(0);
    expect(stats.credits_refunded).toBeGreaterThan(0);
    expect(stats.credits_expired).toBe(0);

    await page.goto('/stats');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Live from the database');
    await expect(page.getByText('Credits auto-refunded')).toBeVisible();
    await expect(page.getByText('Credits expired')).toBeVisible();
  });
});

test.describe('wallet', () => {
  test('lists the automatic refunds and offers a one-click cash-out', async ({ page }) => {
    // Same cookie jar as the page, so /wallet renders this exact wallet.
    await page.goto('/');
    await page.request.post('/api/session');
    const { body } = await generateOk(page.request, 'a doomed frame [[force:fail]]');
    await settle(page.request, body.job.id);

    await page.goto('/wallet');
    await expect(page.getByText('Never expires').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Refunds' }).click();
    await expect(page.getByText('Generation failed, refunded automatically.').first()).toBeVisible();

    await expect(
      page.getByRole('button', { name: /Refund my .* unused credits/ }),
    ).toBeVisible();
  });
});
