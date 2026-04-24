import { buildUnsubscribeUrl } from '@/lib/unsubscribe';
import { env } from '@/lib/env';

export type FooterStyle = 'full' | 'short' | 'none';

export function buildPlainTextFooter(businessId: string): string {
  const url = buildUnsubscribeUrl(businessId);
  return [
    '',
    '---',
    `${env.RESEND_FROM_NAME} — Averis Solutions`,
    'averissolutions.be',
    '',
    'U ontvangt dit bericht op basis van gerechtvaardigd belang (AVG art. 6(1)(f))',
    'als zakelijk contact. Wenst u geen verdere berichten te ontvangen?',
    `Afmelden: ${url}`,
  ].join('\n');
}

/**
 * Kortere, minder bulk-achtige footer. Classifier-vriendelijker dan de volledige
 * variant, behoudt wettelijke vereiste (identiteit zender + afmeld-link onder
 * GDPR/DSA). Gebruikt voor warm / demo-homepage outreach waar Primary-tab
 * placement belangrijker is dan visuele AVG-prominentie.
 */
export function buildShortPlainTextFooter(businessId: string): string {
  const url = buildUnsubscribeUrl(businessId);
  return [
    '',
    '',
    `— Imad, averissolutions.be`,
    `niet geïnteresseerd? ${url}`,
  ].join('\n');
}

export function buildHtmlFooter(businessId: string): string {
  const url = buildUnsubscribeUrl(businessId);
  const style = 'margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:11px;color:#6b7280;line-height:1.5';
  const linkStyle = 'color:#6b7280;text-decoration:underline';
  return `<div style="${style}">
<div style="margin-bottom:8px"><strong>${escapeHtml(env.RESEND_FROM_NAME)}</strong> — Averis Solutions · <a href="https://averissolutions.be" style="${linkStyle}">averissolutions.be</a></div>
<div>U ontvangt dit bericht op basis van gerechtvaardigd belang (AVG art. 6(1)(f)) als zakelijk contact. <a href="${escapeAttr(url)}" style="${linkStyle}">Afmelden</a>.</div>
</div>`;
}

export function appendFooter(
  body: string,
  businessId: string,
  format: 'text' | 'html' = 'text',
  style: FooterStyle = 'full',
): string {
  // 'none' = geen zichtbare footer. Compliance leunt dan op List-Unsubscribe
  // header (blijft altijd aanwezig via sendOutreachEmail). Gebruik met zorg:
  // Gegevensbeschermingsautoriteit België zou kunnen vragen waarom de afmeld-
  // link niet expliciet in de body stond. Voor warm/Primary-first outreach.
  if (style === 'none') {
    return body;
  }
  if (format === 'html') {
    return `${body}${buildHtmlFooter(businessId)}`;
  }
  if (style === 'short') {
    return `${body}${buildShortPlainTextFooter(businessId)}`;
  }
  return `${body}${buildPlainTextFooter(businessId)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;');
}
