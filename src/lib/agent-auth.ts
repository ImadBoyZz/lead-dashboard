// Bearer token auth voor agent/n8n endpoints
// Patroon: Authorization header met "Bearer <AGENT_WEBHOOK_SECRET>"

import { timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export function isValidAgentToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  if (!token) return false;
  const secret = env.AGENT_WEBHOOK_SECRET;
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}
