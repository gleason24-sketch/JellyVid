/**
 * Every secret is read here and nowhere else, and this module is server-only.
 * Nothing in it is prefixed NEXT_PUBLIC_, so none of it can reach the browser
 * bundle -- `tests/secret-leak.test.ts` proves that against the real build.
 */
import 'server-only';

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** `HIGGSFIELD_API_KEY` is a single "keyId:keySecret" pair, as the console issues it. */
export function higgsfieldCredentials(): { keyId: string; keySecret: string } | null {
  const combined = optional('HIGGSFIELD_API_KEY');
  if (combined && combined.includes(':')) {
    const index = combined.indexOf(':');
    return { keyId: combined.slice(0, index), keySecret: combined.slice(index + 1) };
  }
  const keyId = optional('HF_API_KEY_ID');
  const keySecret = optional('HF_API_KEY_SECRET');
  if (keyId && keySecret) return { keyId, keySecret };
  return null;
}

export const env = {
  get supabaseUrl() {
    return required('SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return required('SUPABASE_ANON_KEY');
  },
  get dbSecret() {
    return required('JELLYVID_DB_SECRET');
  },
  get sessionSecret() {
    return required('JELLYVID_SESSION_SECRET');
  },
  get cronSecret() {
    return optional('JELLYVID_CRON_SECRET');
  },
  get stripeSecretKey() {
    return optional('STRIPE_SECRET_KEY');
  },
  get stripeWebhookSecret() {
    return optional('STRIPE_WEBHOOK_SECRET');
  },
  get supportEmail() {
    return optional('JELLYVID_SUPPORT_EMAIL') ?? 'support@jellyvid.com';
  },
  get siteUrl() {
    return optional('NEXT_PUBLIC_SITE_URL') ?? optional('URL') ?? 'https://jellyvid.com';
  },
};

/** Fixture mode: every provider call is served locally, so tests cost nothing. */
export function isMockMode(): boolean {
  return process.env.HF_MOCK === '1';
}

/** True when real generation can run: credentials are present and we are not mocking. */
export function isLiveProvider(): boolean {
  return !isMockMode() && higgsfieldCredentials() !== null;
}

export function stripeEnabled(): boolean {
  return Boolean(optional('STRIPE_SECRET_KEY'));
}
