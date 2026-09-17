/**
 * Anonymous-first sessions.
 *
 * The mission is a first generation inside 60 seconds, and an email gate costs
 * more than that. So the first request mints a real account with a real wallet
 * and real free credits, held in an HMAC-signed httpOnly cookie. Claiming an
 * email later is optional and only exists to move the wallet between devices.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { env } from './env';
import { call } from './db';

export const SESSION_COOKIE = 'jv_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // credits never expire, so neither does this

export interface Wallet {
  balance_credits: number;
  lifetime_granted: number;
  lifetime_purchased: number;
  lifetime_spent: number;
  lifetime_refunded: number;
  never_expires: true;
  expires_at: null;
}

export interface AccountUser {
  id: string;
  email: string | null;
  created_at: string;
  has_recovery_code?: boolean;
  wallet: Wallet;
}

/** Free credits at signup: two video drafts (40 each) plus one final (120). */
export const SIGNUP_GRANT_CREDITS = 200;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export async function signSession(userId: string): Promise<string> {
  const signature = await hmac(userId, env.sessionSecret);
  return `${userId}.${signature}`;
}

export async function readSignedSession(token: string | undefined): Promise<string | null> {
  if (!token || !token.includes('.')) return null;
  const index = token.lastIndexOf('.');
  const userId = token.slice(0, index);
  const signature = token.slice(index + 1);
  const expected = await hmac(userId, env.sessionSecret);
  // Constant-time-ish: compare full strings of equal length only.
  if (signature.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i += 1) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0 ? userId : null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Keyed to the origin we are actually served from, not to NODE_ENV. A
    // production build served over plain HTTP (local `next start`, a preview
    // box, the e2e suite) would otherwise set a Secure cookie the client drops
    // silently -- and every request would mint a fresh wallet.
    secure: env.siteUrl.startsWith('https://'),
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

/** Reads the current account, or null when there is no valid cookie. */
export async function currentUser(): Promise<AccountUser | null> {
  const store = await cookies();
  const userId = await readSignedSession(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await call<AccountUser | null>('jv_user_get', { p_user_id: userId });
  return user ?? null;
}

/** A readable code the user can write down; it is the only cross-device key. */
export function generateRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

export async function createAccount(ipHash: string | null, recoveryCode: string) {
  return call<AccountUser>('jv_bootstrap', {
    p_ip_hash: ipHash,
    p_grant: SIGNUP_GRANT_CREDITS,
    p_recovery_hash: await sha256Hex(recoveryCode),
  });
}

/** Hashed so the raw address is never a lookup key in logs or the events table. */
export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  return (await sha256Hex(`${ip}:${env.sessionSecret}`)).slice(0, 32);
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-nf-client-connection-ip') ?? headers.get('x-forwarded-for');
  if (!forwarded) return null;
  return forwarded.split(',')[0].trim() || null;
}
