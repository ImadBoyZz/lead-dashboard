import { NextRequest, NextResponse } from 'next/server';
import { exchangeGmailCode } from '@/lib/gmail';
import { isValidSession } from '@/lib/auth';

// Google OAuth callback — logt de refresh token server-side
export async function GET(request: NextRequest) {
  if (!(await isValidSession(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Geen auth code ontvangen' }, { status: 400 });
  }

  try {
    const { refreshToken } = await exchangeGmailCode(code);

    // Log token server-side — toon NIET in de response
    console.log(`[Gmail OAuth] Refresh token ontvangen (prefix: ${refreshToken.slice(0, 8)}...). Voeg toe aan .env.local en Vercel env vars.`);

    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Gmail Gekoppeld</title></head>
      <body style="font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px;">
        <h1>Gmail succesvol gekoppeld!</h1>
        <p>De refresh token is gelogd in de server console. Voeg deze toe aan je <code>.env.local</code> en Vercel.</p>
        <p>Herstart daarna de dev server of redeploy op Vercel.</p>
        <a href="/settings" style="color: #3b82f6;">Terug naar dashboard</a>
      </body>
      </html>
    `;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
  } catch (error) {
    console.error('Gmail callback error:', error);
    return NextResponse.json({ error: 'Token exchange mislukt' }, { status: 500 });
  }
}
