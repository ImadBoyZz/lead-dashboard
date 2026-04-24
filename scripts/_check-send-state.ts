// Diagnose huidige send-state: system_settings rows + approved drafts queue
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq, inArray, desc } = await import('drizzle-orm');

  // 1. system_settings raw
  const settings = await db.select().from(schema.systemSettings);
  console.log('=== system_settings ===');
  if (settings.length === 0) {
    console.log('(leeg — alle getSetting() calls vallen op DEFAULTS terug)');
    console.log('DEFAULT send_enabled = true');
    console.log('DEFAULT paused_until = null');
    console.log('DEFAULT warmup_start_date = null');
  } else {
    for (const s of settings) {
      console.log(`  ${s.key}: ${JSON.stringify(s.value)} (updated ${s.updatedAt.toISOString()} by ${s.updatedBy ?? 'unknown'})`);
    }
  }

  // 2. approved drafts in queue
  const approved = await db
    .select({
      id: schema.outreachDrafts.id,
      businessId: schema.outreachDrafts.businessId,
      subject: schema.outreachDrafts.subject,
      createdAt: schema.outreachDrafts.createdAt,
      businessName: schema.businesses.name,
      businessEmail: schema.businesses.email,
    })
    .from(schema.outreachDrafts)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.outreachDrafts.businessId))
    .where(eq(schema.outreachDrafts.status, 'approved'))
    .orderBy(desc(schema.outreachDrafts.createdAt));
  console.log(`\n=== approved drafts in queue: ${approved.length} ===`);
  for (const d of approved) {
    console.log(`  ${d.id.slice(0, 8)}… → ${d.businessName} (${d.businessEmail})`);
    console.log(`    subject: ${d.subject}`);
    console.log(`    created: ${d.createdAt.toISOString()}`);
  }

  // 3. draft status verdeling
  const counts = await db
    .select({
      status: schema.outreachDrafts.status,
      n: schema.outreachDrafts.id,
    })
    .from(schema.outreachDrafts);
  const byStatus: Record<string, number> = {};
  for (const row of counts) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  console.log(`\n=== outreach_drafts status verdeling ===`);
  for (const [s, n] of Object.entries(byStatus)) console.log(`  ${s}: ${n}`);

  // 4. outreach_log last 10 (wat is al verzonden?)
  const recentLog = await db
    .select({
      id: schema.outreachLog.id,
      businessId: schema.outreachLog.businessId,
      subject: schema.outreachLog.subject,
      sentAt: schema.outreachLog.contactedAt,
      deliveryStatus: schema.outreachLog.deliveryStatus,
    })
    .from(schema.outreachLog)
    .orderBy(desc(schema.outreachLog.contactedAt))
    .limit(10);
  console.log(`\n=== laatste 10 outreach_log entries ===`);
  for (const l of recentLog) {
    console.log(`  ${l.sentAt.toISOString()} | ${l.deliveryStatus} | ${l.subject}`);
  }

  // 5. sending status = race-condition candidates
  const sending = await db
    .select()
    .from(schema.outreachDrafts)
    .where(eq(schema.outreachDrafts.status, 'sending'));
  console.log(`\n=== drafts status=sending (in-flight): ${sending.length} ===`);
  for (const s of sending) console.log(`  ${s.id.slice(0, 8)}… created=${s.createdAt.toISOString()}`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
