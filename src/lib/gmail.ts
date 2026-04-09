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

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const safeTo = sanitizeHeader(to);
  const safeSubject = sanitizeHeader(subject);
  const safeFrom = sanitizeHeader(from);

  const pStyle = 'margin:0 0 20px 0;font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6';
  const htmlBody = escapeHtml(body)
    .split('\n\n')
    .map((p) => `<p style="${pStyle}">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  const lines = [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
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
}): Promise<{ messageId: string; threadId: string }> {
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

  return { messageId: res.data.id ?? '', threadId: res.data.threadId ?? '' };
}

// Haal volledige email thread op (verzonden + replies)
export async function getGmailThread(threadId: string): Promise<{
  messages: { from: string; to: string; subject: string; body: string; date: string; isReply: boolean }[];
}> {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_REFRESH_TOKEN) {
    throw new Error('Gmail OAuth niet geconfigureerd');
  }

  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });

  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  const messages = (thread.data.messages ?? []).map((msg) => {
    const headers = msg.payload?.headers ?? [];
    const getHeader = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

    // Decode body
    let body = '';
    const parts = msg.payload?.parts;
    if (parts) {
      const textPart = parts.find((p) => p.mimeType === 'text/plain');
      const htmlPart = parts.find((p) => p.mimeType === 'text/html');
      const part = textPart ?? htmlPart;
      if (part?.body?.data) {
        body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
      }
    } else if (msg.payload?.body?.data) {
      body = Buffer.from(msg.payload.body.data, 'base64url').toString('utf-8');
    }

    // Strip HTML tags voor simpele weergave
    body = body.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

    const from = getHeader('From');
    const isReply = from.includes(env.GMAIL_SENDER_EMAIL) === false;

    return {
      from,
      to: getHeader('To'),
      subject: getHeader('Subject'),
      body,
      date: getHeader('Date'),
      isReply,
    };
  });

  return { messages };
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
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
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
