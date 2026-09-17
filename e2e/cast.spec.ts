/**
 * The cast flow: a face goes in, a cinematic video comes out.
 *
 * This is the capability the product is built around — Seedance 2.5
 * reference-to-video with face inputs — so it gets its own suite covering the
 * upload, the consent gate, the one-tap scene presets, and the gallery loop
 * that turns one finished video into the next person's first visit.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** A real PNG, so the upload path and the perceptual hash both see real bytes. */
function samplePhoto(): Buffer {
  return readFileSync('public/icon-192.png');
}

async function balance(request: APIRequestContext): Promise<number> {
  const response = await request.get('/api/session');
  const body = (await response.json()) as { user: { wallet: { balance_credits: number } } | null };
  return body.user?.wallet.balance_credits ?? 0;
}

test.describe('putting yourself in it', () => {
  test('upload a face, tap a scene, get a video — no prompt written', async ({ page }) => {
    await page.goto('/studio');

    // The cast task is the default, so there is nothing to choose first.
    await expect(page.getByRole('heading', { name: 'What are you making?' })).toBeVisible();
    await expect(page.getByText('Your face')).toBeVisible();

    await page.locator('input[type=file]').setInputFiles({
      name: 'selfie.png',
      mimeType: 'image/png',
      buffer: samplePhoto(),
    });
    await expect(page.getByAltText('Reference 1')).toBeVisible({ timeout: 30_000 });

    // One tap writes the whole shot.
    await page.getByRole('button', { name: /Neon city/ }).click();
    const prompt = page.getByLabel('Scene description');
    await expect(prompt).not.toHaveValue('');
    expect((await prompt.inputValue()).length).toBeGreaterThan(80);

    // A likeness will not run until consent is given.
    const generate = page.getByRole('button', { name: /Generate: \d+ credits/ });
    await expect(generate).toBeDisabled();
    await page.getByRole('checkbox', { name: /written consent/ }).check();
    await expect(generate).toBeEnabled();

    const before = await balance(page.request);
    await generate.click();

    const card = page.locator('article').first();
    await expect(card.getByText('Done')).toBeVisible({ timeout: 90_000 });
    await expect(card.locator('img, video')).toBeVisible();
    expect(await balance(page.request)).toBe(before - 40);
  });

  test('a cast job will not start without a face', async ({ request }) => {
    await request.post('/api/session');
    const before = await balance(request);

    const response = await request.post('/api/generate', {
      data: {
        task: 'star_in_it',
        tier: 'draft',
        prompt: 'walking through a neon city at night',
        consent: true,
        quotedCredits: 40,
      },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe('reference_required');
    expect(await balance(request)).toBe(before); // nothing charged
  });

  test('refuses more reference photos than the model accepts', async ({ request }) => {
    await request.post('/api/session');
    const before = await balance(request);

    const response = await request.post('/api/generate', {
      data: {
        task: 'star_in_it',
        tier: 'draft',
        prompt: 'walking through a neon city at night',
        imageUrls: Array.from({ length: 9 }, (_, i) => `https://cdn.example/${i}.jpg`),
        consent: true,
        quotedCredits: 40,
      },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe('too_many_references');
    expect(await balance(request)).toBe(before);
  });
});

test.describe('the gallery loop', () => {
  test('a shared video appears in the public gallery for a stranger', async ({ page, request }) => {
    await request.post('/api/session');

    const created = await request.post('/api/generate', {
      data: {
        task: 'cinematic_shot',
        tier: 'draft',
        prompt: 'a gallery subject under sodium streetlight',
        quotedCredits: 40,
      },
    });
    const { job } = (await created.json()) as { job: { id: string } };

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const poll = await request.get(`/api/jobs/${job.id}`);
      const body = (await poll.json()) as { job: { status: string } };
      if (!['queued', 'in_progress'].includes(body.job.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    const shared = await request.post(`/api/jobs/${job.id}/share`);
    const { url } = (await shared.json()) as { url: string };

    // The gallery is public, so a visitor with no session sees it.
    const feed = await request.get('/api/gallery');
    const { items } = (await feed.json()) as { items: Array<{ share_slug: string }> };
    const slug = url.replace('/s/', '');
    expect(items.some((item) => item.share_slug === slug)).toBe(true);

    await page.goto('/gallery');
    await expect(page.getByRole('heading', { name: 'Made with JellyVid' })).toBeVisible();
    await expect(page.locator(`a[href="/s/${slug}"]`).first()).toBeVisible();
  });
});
