// Smoke test: stuurt 1 test-mail via Resend naar een opgegeven adres.
// Gebruik: npx tsx scripts/test-resend.ts <recipient-email>
// Valideert: Resend API key, DKIM alignment, List-Unsubscribe header,
// footer met AVG-tekst en unsubscribe link.

import { config } from 'dotenv';
config({ path: '.env.local' });

// dynamisch importeren NA dotenv zodat env.ts de vars ziet
async function main() {
  const recipient = process.argv[2];
  if (!recipient || !recipient.includes('@')) {
    console.error('Gebruik: npx tsx scripts/test-resend.ts <email>');
    process.exit(1);
  }

  const { sendOutreachEmail } = await import('../src/lib/email/send');
  const { neon } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-http');
  const { sql } = await import('drizzle-orm');

  // Pak een willekeurige bestaande business voor de unsubscribe token —
  // anders is de landing page /unsubscribe/... leeg want er wordt op id gezocht.
  const sqlClient = neon(process.env.DATABASE_URL!);
  const db = drizzle(sqlClient);
  const rows = await db.execute(
    sql`SELECT id, name FROM businesses ORDER BY created_at DESC LIMIT 1`,
  );
  const business = rows.rows[0] as { id: string; name: string } | undefined;
  if (!business) {
    console.error('Geen businesses in DB — seed eerst een test-business.');
    process.exit(1);
  }

  console.log(`→ Verzenden naar ${recipient}`);
  console.log(`→ Business context: ${business.name} (${business.id})`);

  const subject = 'Test: Averis Solutions deliverability check';
  const body = [
    `Beste ${business.name},`,
    '',
    'Dit is een geautomatiseerde deliverability test vanuit het nieuwe',
    'lead-dashboard. Als u deze mail ontvangt in de hoofdinbox (niet spam),',
    'is de Resend + DKIM configuratie correct.',
    '',
    'Check onderaan de correcte afmeldlink en de AVG-verantwoording.',
    '',
    'Groet,',
    'Imad',
  ].join('\n');

  try {
    const result = await sendOutreachEmail({
      to: recipient,
      subject,
      body,
      businessId: business.id,
    });
    console.log('\n✓ Verzonden');
    console.log('  Resend message id:', result.messageId);
    console.log('  Unsubscribe URL:', result.unsubscribeUrl);
    console.log('\nControleer in je inbox:');
    console.log('  1. Mail komt in hoofdinbox (niet spam)');
    console.log('  2. Afzender toont als "Imad Bardid <imad@averissolutions.be>"');
    console.log('  3. Klik op "Show original" in Gmail → SPF=PASS, DKIM=PASS, DMARC=PASS');
    console.log('  4. Footer bevat AVG-tekst + werkende afmeldlink');
    console.log('  5. In Gmail verschijnt "List-Unsubscribe" als klein linkje bovenaan');
  } catch (err) {
    console.error('\n✗ Fout:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
