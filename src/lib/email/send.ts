import { Resend } from 'resend';
import { env } from '@/lib/env';
import { buildUnsubscribeUrl } from '@/lib/unsubscribe';
import { appendFooter, type FooterStyle } from '@/lib/email-footer';
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
  // Deliverability opties voor warm/demo-homepage outreach waar Primary-tab
  // placement belangrijker is dan open-tracking data.
  //
  // plainTextOnly=true: geen HTML body, geen tracking pixel. Mail leest als
  // een normale 1-op-1 mail. Trade-off: opened_at wordt nooit gevuld (geen
  // pixel fire zonder HTML).
  //
  // footerStyle='short': compacte 2-regelige footer i.p.v. volledige AVG blok.
  // Behoudt wettelijke minimum (zender + afmeld-link) maar minder bulk-signal.
  plainTextOnly?: boolean;
  footerStyle?: FooterStyle;
};

export type SendOutreachResult = {
  messageId: string;
  unsubscribeUrl: string;
};

export async function sendOutreachEmail(
  input: SendOutreachInput,
): Promise<SendOutreachResult> {
  const { to, subject, body, businessId, outreachLogId } = input;
  const plainTextOnly = input.plainTextOnly ?? false;
  const footerStyle: FooterStyle = input.footerStyle ?? 'full';

  const unsubscribeUrl = buildUnsubscribeUrl(businessId);
  const bodyWithFooter = appendFooter(body, businessId, 'text', footerStyle);

  // HTML body + pixel: alleen als we NIET plaintext-only draaien. Plaintext-
  // only haalt bulk-signals (HTML opmaak + 1x1 pixel) weg voor betere
  // Primary-tab placement. Trade-off: geen open-tracking data.
  let htmlBody: string | undefined;
  if (!plainTextOnly) {
    const trackingUrl = buildOpenTrackingUrl(outreachLogId);
    const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none" alt="" />`;
    htmlBody = `${plainTextToHtml(body)}${appendFooter('', businessId, 'html')}${trackingPixel}`;
  }

  const from = `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`;
  const replyTo = input.replyTo ?? env.RESEND_FROM_EMAIL;

  const res = await getClient().emails.send({
    from,
    to: [to],
    replyTo,
    subject,
    text: bodyWithFooter,
    ...(htmlBody !== undefined ? { html: htmlBody } : {}),
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
