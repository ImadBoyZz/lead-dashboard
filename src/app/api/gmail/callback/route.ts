import { NextRequest, NextResponse } from 'next/server';
import { exchangeGmailCode } from '@/lib/gmail';

// Google OAuth callback — toont de refresh token die je in .env.local zet
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Geen auth code ontvangen' }, { status: 400 });
  }

  try {
    const { refreshToken } = await exchangeGmailCode(code);

    // Toon de refresh token zodat de gebruiker het kan opslaan
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Gmail Gekoppeld</title></head>
      <body style="font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px;">
        <h1>Gmail succesvol gekoppeld!</h1>
        <p>Kopieer deze refresh token en voeg toe aan je <code>.env.local</code> en Vercel:</p>
        <pre style="background: #f1f5f9; padding: 16px; border-radius: 8px; word-break: break-all; font-size: 14px;">GMAIL_REFRESH_TOKEN=${refreshToken}</pre>
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
