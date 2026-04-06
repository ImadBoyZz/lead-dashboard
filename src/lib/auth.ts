import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const SESSION_COOKIE = 'ld_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dagen

function getSessionSecret(): string {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) throw new Error('DASHBOARD_SECRET is not set');
  return secret;
}

function hashToken(password: string, secret: string): string {
  // Simple HMAC-like hash using Web Crypto isn't available synchronously,
  // so we use a deterministic token: base64(password + secret)
  const token = Buffer.from(`${password}:${secret}`).toString('base64');
  return token;
}

export async function createSession(password: string): Promise<boolean> {
  const dashboardPassword = process.env.DASHBOARD_PASSWORD;
  if (!dashboardPassword) return false;
  if (password !== dashboardPassword) return false;

  const token = hashToken(password, getSessionSecret());
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

export function isValidSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const dashboardPassword = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.DASHBOARD_SECRET;
  if (!dashboardPassword || !secret) return false;

  const expected = hashToken(dashboardPassword, secret);
  return token === expected;
}
