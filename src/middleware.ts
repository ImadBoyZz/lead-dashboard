import { NextRequest, NextResponse } from 'next/server';
import { isValidSession } from '@/lib/auth';

// Routes die GEEN auth nodig hebben
const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/sync',        // n8n webhook (eigen Bearer auth)
  '/api/audit',       // n8n webhook (eigen Bearer auth)
  '/api/reminders/due', // n8n webhook (eigen Bearer auth)
  '/api/agent',         // managed agent endpoints (eigen Bearer auth)
  '/api/gmail/callback', // Google OAuth callback
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static files & Next.js internals skippen
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Public routes doorlaten
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Session checken
  if (!(await isValidSession(request))) {
    // API routes: 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Pages: redirect naar login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
