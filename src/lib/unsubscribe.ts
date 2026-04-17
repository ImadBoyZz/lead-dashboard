import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

const SEPARATOR = '.';
const DEFAULT_TTL_DAYS = 365;

function getSecret(): string {
  const secret = env.UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('UNSUBSCRIBE_SECRET ontbreekt of te kort (min 16 chars)');
  }
  return secret;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function generateUnsubscribeToken(
  businessId: string,
  ttlDays: number = DEFAULT_TTL_DAYS,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
  const body = `${businessId}:${expiresAt}`;
  const payload = base64UrlEncode(body);
  const signature = sign(payload);
  return `${payload}${SEPARATOR}${signature}`;
}

export type UnsubscribeVerification =
  | { valid: true; businessId: string; expiresAt: number }
  | { valid: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyUnsubscribeToken(token: string): UnsubscribeVerification {
  const parts = token.split(SEPARATOR);
  if (parts.length !== 2) return { valid: false, reason: 'malformed' };

  const [payload, signature] = parts;
  const expected = sign(payload);

  const sigBuf = Buffer.from(signature, 'base64url');
  const expBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'bad_signature' };
  }

  const decoded = base64UrlDecode(payload).toString('utf8');
  const [businessId, expiresAtStr] = decoded.split(':');
  const expiresAt = parseInt(expiresAtStr, 10);
  if (!businessId || Number.isNaN(expiresAt)) {
    return { valid: false, reason: 'malformed' };
  }
  if (Math.floor(Date.now() / 1000) > expiresAt) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, businessId, expiresAt };
}

export function buildUnsubscribeUrl(businessId: string): string {
  const token = generateUnsubscribeToken(businessId);
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return `${base}/unsubscribe/${token}`;
}
