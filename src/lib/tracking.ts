import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

const SEPARATOR = '.';
// 12 random bytes ≈ 16 base64url chars. Genoeg om bruteforce uit te sluiten,
// kort genoeg om de pixel URL leesbaar te houden.
const SIG_BYTES = 12;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sign(payload: string): string {
  const full = createHmac('sha256', env.DASHBOARD_SECRET).update(payload).digest();
  return full.subarray(0, SIG_BYTES).toString('base64url');
}

export function generateOpenTrackingToken(outreachLogId: string): string {
  return `${outreachLogId}${SEPARATOR}${sign(outreachLogId)}`;
}

export type OpenTrackingVerification =
  | { valid: true; outreachLogId: string }
  | { valid: false; reason: 'malformed' | 'bad_uuid' | 'bad_signature' };

export function verifyOpenTrackingToken(token: string): OpenTrackingVerification {
  const parts = token.split(SEPARATOR);
  if (parts.length !== 2) return { valid: false, reason: 'malformed' };

  const [outreachLogId, signature] = parts;
  if (!UUID_RE.test(outreachLogId)) return { valid: false, reason: 'bad_uuid' };

  const expected = sign(outreachLogId);
  const sigBuf = Buffer.from(signature, 'base64url');
  const expBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'bad_signature' };
  }
  return { valid: true, outreachLogId };
}

export function buildOpenTrackingUrl(outreachLogId: string): string {
  const token = generateOpenTrackingToken(outreachLogId);
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return `${base}/api/tracking/open/${token}`;
}
