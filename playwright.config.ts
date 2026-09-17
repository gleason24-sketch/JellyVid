import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Mirror .env.local into the server the tests boot.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    // The product is mobile-first, so the suite runs on a phone by default.
    ...devices['Pixel 7'],
    launchOptions: {
      // Use the Chromium already on the image rather than downloading a build
      // matched to this Playwright version. Unset it to fall back to the
      // normal `npx playwright install` browser.
      ...(process.env.JELLYVID_CHROMIUM_PATH
        ? { executablePath: process.env.JELLYVID_CHROMIUM_PATH }
        : {}),
    },
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      ...(process.env as Record<string, string>),
      // Every provider call is a local fixture, so the suite costs $0.
      HF_MOCK: '1',
      // Short deadline so the timeout-refund path is testable in seconds.
      JELLYVID_JOB_TIMEOUT_SECONDS: '4',
      // Production caps free-credit signups at 5 per IP per day; the whole
      // suite shares one loopback address, so raise it here only.
      JELLYVID_SIGNUPS_PER_IP_PER_DAY: '1000',
      NEXT_PUBLIC_SITE_URL: baseURL,
    },
  },
});
