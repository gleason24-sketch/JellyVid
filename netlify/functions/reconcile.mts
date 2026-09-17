import type { Config } from '@netlify/functions';

/**
 * Scheduled sweep. Calls the app's reconcile route so jobs nobody is polling
 * still reach a terminal state and still refund. Schedule lives here, not in
 * netlify.toml, so the function and its cadence stay together.
 */
export default async function handler(): Promise<Response> {
  const base = process.env.URL ?? process.env.DEPLOY_URL ?? 'http://localhost:3000';
  const secret = process.env.JELLYVID_CRON_SECRET;

  const response = await fetch(`${base}/api/reconcile`, {
    method: 'POST',
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });

  const body = await response.text();
  console.log('[jellyvid] reconcile', response.status, body);
  return new Response(body, { status: response.status });
}

export const config: Config = { schedule: '*/5 * * * *' };
