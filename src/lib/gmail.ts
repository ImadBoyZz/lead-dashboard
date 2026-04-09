// Gmail API integratie — verstuurt emails via OAuth2
// Vereist: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL

import { google } from 'googleapis';
import { env } from '@/lib/env';

function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    `${env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`,
  );
  oauth2Client.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  return oauth2Client;
}

function createRawEmail({
  to,
  subject,
  body,
  from,
}: {
  to: string;
  subject: string;
  body: string;
  from: string;
}): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ];
  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

export async function sendGmail({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ messageId: string }> {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    throw new Error('Gmail OAuth niet geconfigureerd. Voeg GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET en GMAIL_REFRESH_TOKEN toe.');
  }

  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });

  const raw = createRawEmail({
    to,
    subject,
    body,
    from: env.GMAIL_SENDER_EMAIL || 'noreply@averissolutions.be',
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  return { messageId: res.data.id ?? '' };
}

// Genereer de OAuth URL voor eerste keer token ophalen
export function getGmailAuthUrl(): string {
  const oauth2Client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    `${env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`,
  );
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
  });
}

// Wissel auth code in voor tokens (eenmalig)
export async function exchangeGmailCode(code: string): Promise<{ refreshToken: string }> {
  const oauth2Client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    `${env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`,
  );
  const { tokens } = await oauth2Client.getToken(code);
  return { refreshToken: tokens.refresh_token ?? '' };
}
