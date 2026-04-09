import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
    const { allowed } = rateLimit(`login:${ip}`, 5, 15 * 60 * 1000); // 5 pogingen per 15 min
    if (!allowed) {
      return NextResponse.json({ error: 'Te veel pogingen. Probeer het later opnieuw.' }, { status: 429 });
    }

    const { password } = await request.json();

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const success = await createSession(password);

    if (!success) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
