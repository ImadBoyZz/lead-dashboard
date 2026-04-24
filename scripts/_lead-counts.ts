// Diagnose waar de lead-filter leegloopt
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { count, and, eq, inArray, isNotNull, or, sql } = await import('drizzle-orm');

  async function cnt(where: ReturnType<typeof and> | ReturnType<typeof sql>) {
    const [r] = await db.select({ c: count() }).from(schema.businesses).where(where);
    return r.c;
  }

  console.log('Totaal businesses:', (await db.select({ c: count() }).from(schema.businesses))[0].c);
  console.log('  country=BE:', await cnt(eq(schema.businesses.country, 'BE')));
  console.log('  +postal VL (1000-3999 of 8000-9999):', await cnt(and(
    eq(schema.businesses.country, 'BE'),
    or(
      sql`${schema.businesses.postalCode} BETWEEN '1000' AND '3999'`,
      sql`${schema.businesses.postalCode} BETWEEN '8000' AND '9999'`,
    ),
  )));
  console.log('  +NACE target:', await cnt(and(
    eq(schema.businesses.country, 'BE'),
    or(
      sql`${schema.businesses.postalCode} BETWEEN '1000' AND '3999'`,
      sql`${schema.businesses.postalCode} BETWEEN '8000' AND '9999'`,
    ),
    or(
      sql`${schema.businesses.naceCode} LIKE '56%'`,
      sql`${schema.businesses.naceCode} LIKE '9602%'`,
      sql`${schema.businesses.naceCode} LIKE '45%'`,
      sql`${schema.businesses.naceCode} LIKE '41%'`,
      sql`${schema.businesses.naceCode} LIKE '42%'`,
      sql`${schema.businesses.naceCode} LIKE '43%'`,
      sql`${schema.businesses.naceCode} LIKE '47%'`,
    ),
  )));
  console.log('  +email NOT NULL:', await cnt(and(
    eq(schema.businesses.country, 'BE'),
    isNotNull(schema.businesses.email),
  )));
  console.log('  +email_status in (smtp_valid, mx_valid):', await cnt(and(
    eq(schema.businesses.country, 'BE'),
    isNotNull(schema.businesses.email),
    inArray(schema.businesses.emailStatus, ['smtp_valid', 'mx_valid']),
  )));
  console.log('  +opt_out=false + blacklisted=false:', await cnt(and(
    eq(schema.businesses.country, 'BE'),
    isNotNull(schema.businesses.email),
    inArray(schema.businesses.emailStatus, ['smtp_valid', 'mx_valid']),
    eq(schema.businesses.optOut, false),
    eq(schema.businesses.blacklisted, false),
  )));

  // Verdeling email_status
  const { sql: sqlHelper } = await import('drizzle-orm');
  const statuses = await db
    .select({
      s: schema.businesses.emailStatus,
      c: count(),
    })
    .from(schema.businesses)
    .groupBy(schema.businesses.emailStatus);
  console.log('\nemail_status verdeling:');
  for (const row of statuses) console.log(`  ${row.s ?? '(null)'}: ${row.c}`);

  // NACE verdeling top 10
  const naceStats = await db
    .select({ n: schema.businesses.naceCode, c: count() })
    .from(schema.businesses)
    .groupBy(schema.businesses.naceCode)
    .orderBy(sql`count(*) desc`)
    .limit(15);
  console.log('\ntop 15 NACE codes:');
  for (const r of naceStats) console.log(`  ${r.n}: ${r.c}`);

  // audit_results count
  const [auditC] = await db.select({ c: count() }).from(schema.auditResults);
  console.log(`\ntotaal audit_results rows: ${auditC.c}`);

  // Pipeline stage verdeling
  const stages = await db
    .select({ s: schema.leadPipeline.stage, c: count() })
    .from(schema.leadPipeline)
    .groupBy(schema.leadPipeline.stage);
  console.log('\npipeline stages:');
  for (const r of stages) console.log(`  ${r.s}: ${r.c}`);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
