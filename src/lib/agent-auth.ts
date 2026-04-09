// Bearer token auth voor agent/n8n endpoints
// Patroon: Authorization header met "Bearer <AGENT_WEBHOOK_SECRET>"

import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export function isValidAgentToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === env.AGENT_WEBHOOK_SECRET && token !== '';
}
