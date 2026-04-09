import { NextResponse } from 'next/server';
import { getGmailAuthUrl } from '@/lib/gmail';

// Redirect naar Google OAuth consent screen
export async function GET() {
  try {
    const url = getGmailAuthUrl();
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Gmail auth error:', error);
    return NextResponse.json({ error: 'Gmail OAuth niet geconfigureerd' }, { status: 500 });
  }
}
