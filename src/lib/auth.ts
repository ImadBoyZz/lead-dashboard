import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const SESSION_COOKIE = 'ld_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dagen

const encoder = new TextEncoder();

function getSessionSecret(): string {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) throw new Error('DASHBOARD_SECRET is not set');
  return secret;
}

async function hashToken(password: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(password));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function createSession(password: string): Promise<boolean> {
  const dashboardPassword = process.env.DASHBOARD_PASSWORD;
  if (!dashboardPassword) return false;
  if (password !== dashboardPassword) return false;

  const token = await hashToken(password, getSessionSecret());
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return true;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function isValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const dashboardPassword = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.DASHBOARD_SECRET;
  if (!dashboardPassword || !secret) return false;

  const expected = await hashToken(dashboardPassword, secret);
  return timingSafeCompare(token, expected);
}
