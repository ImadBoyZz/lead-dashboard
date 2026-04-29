import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { gte, desc, sql } = await import('drizzle-orm');
  const start = new Date(); start.setHours(0,0,0,0);

  const created = await db.select({ id: schema.outreachDrafts.id, status: schema.outreachDrafts.status, createdAt: schema.outreachDrafts.createdAt, subject: schema.outreachDrafts.subject })
    .from(schema.outreachDrafts).where(gte(schema.outreachDrafts.createdAt, start)).orderBy(desc(schema.outreachDrafts.createdAt));
  console.log('drafts CREATED today:', created.length);
  for (const d of created) console.log(' ', d.createdAt.toISOString(), d.status, '|', d.subject);

  const updated = await db.select({ id: schema.outreachDrafts.id, status: schema.outreachDrafts.status, updatedAt: schema.outreachDrafts.updatedAt, subject: schema.outreachDrafts.subject })
    .from(schema.outreachDrafts).where(gte(schema.outreachDrafts.updatedAt, start)).orderBy(desc(schema.outreachDrafts.updatedAt));
  console.log('\ndrafts UPDATED today:', updated.length);
  for (const d of updated) console.log(' ', d.updatedAt.toISOString(), d.status, '|', d.subject);

  const queue: any = await db.execute(sql`SELECT status, COUNT(*)::int as n FROM outreach_drafts GROUP BY status ORDER BY n DESC`);
  console.log('\nqueue verdeling totaal:');
  for (const r of (queue.rows ?? queue)) console.log(' ', r.status, r.n);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
