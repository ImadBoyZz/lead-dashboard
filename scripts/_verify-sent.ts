import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq, desc } = await import('drizzle-orm');

  const DRAFT = 'db121809-2732-4a77-b7cc-4defee083f19';

  const [draft] = await db.select().from(schema.outreachDrafts)
    .where(eq(schema.outreachDrafts.id, DRAFT)).limit(1);
  console.log('Draft:', {
    id: draft?.id, status: draft?.status, updatedAt: draft?.updatedAt,
  });

  const logs = await db.select().from(schema.outreachLog)
    .where(eq(schema.outreachLog.draftId, DRAFT))
    .orderBy(desc(schema.outreachLog.contactedAt));
  console.log('\nOutreach log entries:');
  for (const l of logs) {
    console.log(' ', {
      id: l.id, channel: l.channel, deliveryStatus: l.deliveryStatus,
      resendMessageId: l.resendMessageId, contactedAt: l.contactedAt,
    });
  }

  // Restore email
  await db.update(schema.businesses)
    .set({ email: 'sales@enovasolar.be', updatedAt: new Date() })
    .where(eq(schema.businesses.id, '86b61357-5637-49e8-80c5-874161dd669d'));
  console.log('\nEmail Enova Solar hersteld naar sales@enovasolar.be');
})();
