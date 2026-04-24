// Natural warmup: stuur een 1-op-1 persoonlijke mail via Resend vanuit
// imad@averissolutions.be. Geen pixel, geen footer, geen List-Unsubscribe —
// gewoon een echte mail zoals je naar een kennis zou schrijven.
//
// Bouwt reputation op voor averissolutions.be via dezelfde Resend sending pool
// als de cold outreach. Doel: echte replies = sterkste positive signal voor
// Gmail/Outlook classifiers.
//
// Gebruik (2 manieren):
//   1. Args:   npx tsx scripts/_natural-send.ts <recipient@email> "Subject hier"
//              Body typ je dan in de terminal (meerdere regels, Ctrl+D om te versturen)
//   2. Env:    NATURAL_TO=recipient@email NATURAL_SUBJECT="Subject" NATURAL_BODY="Hey..."
//              npx tsx scripts/_natural-send.ts

import { config } from 'dotenv';
import path from 'node:path';
import { readFileSync } from 'node:fs';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const args = process.argv.slice(2);
  const recipient = args[0] ?? process.env.NATURAL_TO;
  const subject = args[1] ?? process.env.NATURAL_SUBJECT;
  let body = process.env.NATURAL_BODY;

  if (!recipient || !recipient.includes('@')) {
    console.error('Gebruik: npx tsx scripts/_natural-send.ts <recipient@email> "Subject"');
    console.error('Of via env vars: NATURAL_TO, NATURAL_SUBJECT, NATURAL_BODY');
    process.exit(1);
  }
  if (!subject) {
    console.error('Subject ontbreekt (als 2e arg of NATURAL_SUBJECT env)');
    process.exit(1);
  }

  if (!body) {
    // Lees body van stdin (multiline, Ctrl+D om te eindigen)
    console.log(`→ Typ je mail body (meerdere regels OK, druk Ctrl+Z dan Enter op Windows om te versturen):\n`);
    body = readFileSync(0, 'utf-8').trim();
  }

  if (!body) {
    console.error('Body is leeg.');
    process.exit(1);
  }

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY!);

  const from = `${process.env.RESEND_FROM_NAME ?? 'Imad Bardid'} <${process.env.RESEND_FROM_EMAIL ?? 'imad@averissolutions.be'}>`;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`From:    ${from}`);
  console.log(`To:      ${recipient}`);
  console.log(`Subject: ${subject}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(body);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log('→ Verzenden...');

  // Plain text only, geen HTML, geen footer, geen pixel, geen List-Unsubscribe.
  // Dit is een "natural" mail, geen bulk/marketing.
  const result = await resend.emails.send({
    from,
    to: [recipient],
    subject,
    text: body,
    tags: [{ name: 'kind', value: 'natural_warmup' }],
  });

  if (result.error) {
    console.error('\n✗ Fout:', result.error.name, '-', result.error.message);
    process.exit(1);
  }

  console.log(`\n✓ Verzonden. Resend message id: ${result.data?.id}\n`);
  console.log('Tip: krijg je een reply, markeer die dan als "Belangrijk" in Gmail.');
  console.log('     Die reply-open-reply-mark-as-important cyclus = sterkste positive signal.');

  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
