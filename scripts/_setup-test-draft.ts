import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // Kies een test lead waarvoor we zelf de mail willen ontvangen op eigen account.
  // Ik gebruik Enova Solar maar verander de email naar Imad's test adres zodat
  // de test-mail naar Imad komt, niet naar het échte bedrijf.
  const TEST_BUSINESS_ID = '86b61357-5637-49e8-80c5-874161dd669d'; // Enova Solar
  const TEST_EMAIL = 'bardid.imad@gmail.com';

  // Backup origineel email
  const [orig] = await db.select({ email: schema.businesses.email })
    .from(schema.businesses).where(eq(schema.businesses.id, TEST_BUSINESS_ID)).limit(1);
  console.log('Origineel email:', orig?.email);

  // Overschrijf naar test email
  await db.update(schema.businesses)
    .set({ email: TEST_EMAIL, emailStatus: 'mx_valid', updatedAt: new Date() })
    .where(eq(schema.businesses.id, TEST_BUSINESS_ID));
  console.log('Email tijdelijk gezet op', TEST_EMAIL);

  // Verwijder eventuele bestaande actieve drafts (status pending/approved/sending)
  await db.delete(schema.outreachDrafts)
    .where(eq(schema.outreachDrafts.businessId, TEST_BUSINESS_ID));

  // Maak nieuwe test draft
  const [draft] = await db.insert(schema.outreachDrafts).values({
    businessId: TEST_BUSINESS_ID,
    channel: 'email',
    subject: '[TEST] Werkt de automatische send pipeline?',
    body: 'Dit is een automatische test van de lead-dashboard send pipeline.\n\nAls je dit leest, werkt: approve → to-send → Resend → logging.\n\nMet vriendelijke groet,\nImad',
    tone: 'semi-formal',
    status: 'pending',
    aiProvider: 'test',
    aiModel: 'manual',
    variantIndex: 0,
  }).returning();

  console.log('\nDraft aangemaakt:');
  console.log('  draftId:', draft.id);
  console.log('  businessId:', TEST_BUSINESS_ID);
  console.log('  naar:', TEST_EMAIL);
  console.log('  status:', draft.status);
  console.log('\nHerstel-commando (na test):');
  console.log(`  UPDATE businesses SET email = '${orig?.email}' WHERE id = '${TEST_BUSINESS_ID}';`);
})();
