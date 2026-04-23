import { Resend } from 'resend';
import { env } from '@/lib/env';
import { buildUnsubscribeUrl } from '@/lib/unsubscribe';
import { appendFooter } from '@/lib/email-footer';
import { buildOpenTrackingUrl } from '@/lib/tracking';

let client: Resend | null = null;

function getClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY ontbreekt in environment');
  }
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

function plainTextToHtml(text: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pStyle = 'margin:0 0 16px 0;font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6';
  return escape(text)
    .split('\n\n')
    .map((p) => `<p style="${pStyle}">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export type SendOutreachInput = {
  to: string;
  subject: string;
  body: string;
  businessId: string;
  // Pre-gen UUID die ook gebruikt wordt voor de outreach_log row PK.
  // Nodig zodat de open-tracking pixel URL bekend is vóór de send call.
  outreachLogId: string;
  replyTo?: string;
};

export type SendOutreachResult = {
  messageId: string;
  unsubscribeUrl: string;
};

export async function sendOutreachEmail(
  input: SendOutreachInput,
): Promise<SendOutreachResult> {
  const { to, subject, body, businessId, outreachLogId } = input;

  const unsubscribeUrl = buildUnsubscribeUrl(businessId);
  const trackingUrl = buildOpenTrackingUrl(outreachLogId);
  const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none" alt="" />`;
  const bodyWithFooter = appendFooter(body, businessId, 'text');
  // Pixel als laatste element van de HTML body, na footer. Email clients sluiten
  // missing tags automatisch (we sturen geen <html>/<body> wrapper).
  const htmlBody = `${plainTextToHtml(body)}${appendFooter('', businessId, 'html')}${trackingPixel}`;

  const from = `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`;
  const replyTo = input.replyTo ?? env.RESEND_FROM_EMAIL;

  const res = await getClient().emails.send({
    from,
    to: [to],
    replyTo,
    subject,
    text: bodyWithFooter,
    html: htmlBody,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${env.RESEND_FROM_EMAIL}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [
      { name: 'business_id', value: businessId.replace(/-/g, '_') },
      { name: 'kind', value: 'outreach' },
    ],
  });

  if (res.error) {
    throw new Error(`Resend fout: ${res.error.name}: ${res.error.message}`);
  }
  if (!res.data?.id) {
    throw new Error('Resend gaf geen message id terug');
  }

  return { messageId: res.data.id, unsubscribeUrl };
}
