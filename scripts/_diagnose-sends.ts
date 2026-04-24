import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq, desc, sql } = await import('drizzle-orm');

  // Alle sent mails met volledige recipient info
  const sent = await db
    .select({
      id: schema.outreachLog.id,
      businessId: schema.outreachLog.businessId,
      subject: schema.outreachLog.subject,
      sentAt: schema.outreachLog.contactedAt,
      deliveryStatus: schema.outreachLog.deliveryStatus,
      openedAt: schema.outreachLog.openedAt,
      openedCount: schema.outreachLog.openedCount,
      businessName: schema.businesses.name,
      email: schema.businesses.email,
    })
    .from(schema.outreachLog)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.outreachLog.businessId))
    .orderBy(desc(schema.outreachLog.contactedAt))
    .limit(60);

  console.log(`\n=== Totaal in outreach_log: ${sent.length} ===\n`);
  console.log('Laatste 20:\n');
  for (const s of sent.slice(0, 20)) {
    console.log(`${s.sentAt.toISOString()} | ${s.deliveryStatus} | ${s.email}`);
    console.log(`  → ${s.businessName}: "${s.subject}"`);
    if (s.openedAt) console.log(`  opened ${s.openedCount}x @ ${s.openedAt.toISOString()}`);
  }

  // Hoeveel unieke email-adressen zijn aangeschreven?
  const uniqueEmails = await db.execute<{ email: string; n: number }>(sql`
    SELECT b.email, COUNT(*)::int AS n
    FROM outreach_log ol
    JOIN businesses b ON b.id = ol.business_id
    GROUP BY b.email
    ORDER BY n DESC
  `);
  const rows = uniqueEmails.rows ?? uniqueEmails;
  console.log(`\n=== Unieke recipients: ${Array.isArray(rows) ? rows.length : 0} ===\n`);
  for (const r of (rows as { email: string; n: number }[]).slice(0, 20)) {
    console.log(`  ${r.email}: ${r.n}x`);
  }

  // 1 pending draft
  const pending = await db
    .select({
      id: schema.outreachDrafts.id,
      businessId: schema.outreachDrafts.businessId,
      subject: schema.outreachDrafts.subject,
      createdAt: schema.outreachDrafts.createdAt,
      businessName: schema.businesses.name,
      email: schema.businesses.email,
    })
    .from(schema.outreachDrafts)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.outreachDrafts.businessId))
    .where(eq(schema.outreachDrafts.status, 'pending'));
  console.log(`\n=== Pending drafts: ${pending.length} ===`);
  for (const p of pending) {
    console.log(`  ${p.id} → ${p.businessName} (${p.email}) subj="${p.subject}"`);
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
