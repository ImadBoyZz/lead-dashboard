import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq, desc, gte, sql } = await import('drizzle-orm');
  const { Resend } = await import('resend');

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // outreach_log = mijn pipeline tracking
  const logs = await db
    .select({
      id: schema.outreachLog.id,
      businessId: schema.outreachLog.businessId,
      subject: schema.outreachLog.subject,
      contactedAt: schema.outreachLog.contactedAt,
      resendMessageId: schema.outreachLog.resendMessageId,
      businessEmail: schema.businesses.email,
      businessName: schema.businesses.name,
    })
    .from(schema.outreachLog)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.outreachLog.businessId))
    .where(gte(schema.outreachLog.contactedAt, startOfToday))
    .orderBy(desc(schema.outreachLog.contactedAt));

  console.log(`\n=== outreach_log rows sinds vandaag 00:00: ${logs.length} ===\n`);
  for (const l of logs) {
    console.log(`${l.contactedAt.toISOString()}`);
    console.log(`  business: ${l.businessName} (echte email: ${l.businessEmail})`);
    console.log(`  subject: "${l.subject}"`);
    console.log(`  resend_id: ${l.resendMessageId ?? '(niet via Resend)'}`);
    console.log();
  }

  // Resend dashboard call — toon actual recipient van elk bericht
  // (outreach_log tracks business, maar recipient kan anders zijn bij tests)
  console.log('=== Recipient check via Resend API ===\n');
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const emailsPage = await resend.emails.list({ limit: 15 } as { limit: number });
  const emails = (emailsPage as unknown as { data: { data: Array<{ id: string; to: string[]; subject: string; created_at: string }> } }).data?.data ?? [];
  for (const e of emails.slice(0, 15)) {
    const createdAt = new Date(e.created_at);
    if (createdAt < startOfToday) continue;
    console.log(`${createdAt.toISOString()}`);
    console.log(`  to: ${e.to.join(', ')}`);
    console.log(`  subject: "${e.subject}"`);
    console.log(`  resend_id: ${e.id}`);
    console.log();
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
