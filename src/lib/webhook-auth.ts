// Gedeelde Bearer-token auth voor webhook endpoints (n8n, agent-triggers).
// timingSafeEqual tegen string-length leak.

import { timingSafeEqual } from 'crypto';
import { env } from '@/lib/env';
import { isValidSession } from '@/lib/auth';

function verifyBearer(request: Request, secret: string): boolean {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  if (!token || !secret) return false;
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}

export function authenticateN8n(request: Request): boolean {
  return verifyBearer(request, env.N8N_WEBHOOK_SECRET);
}

export function authenticateAgent(request: Request): boolean {
  return verifyBearer(request, env.AGENT_WEBHOOK_SECRET);
}

/**
 * Accepteert óf een ingelogde dashboard-sessie óf een n8n Bearer token.
 * Gebruik in endpoints die zowel vanuit UI als n8n aangeroepen worden
 * (bv. /api/qualify/[id], /api/enrich/*).
 */
export async function authenticateSessionOrBearer(request: Request): Promise<boolean> {
  if (authenticateN8n(request)) return true;
  // Cast naar NextRequest is veilig — isValidSession leest enkel cookies.
  return await isValidSession(request as unknown as Parameters<typeof isValidSession>[0]);
}
