// Zoek welke leads echt sendable zijn + toon overlap met audit_results
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { and, eq, inArray, isNotNull, or, sql } = await import('drizzle-orm');

  // 1. Alle email-valid + niet opt-out/blacklisted (4 leads verwacht)
  const emailValid = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      email: schema.businesses.email,
      emailStatus: schema.businesses.emailStatus,
      nace: schema.businesses.naceCode,
      naceDesc: schema.businesses.naceDescription,
      city: schema.businesses.city,
      optOut: schema.businesses.optOut,
      blacklisted: schema.businesses.blacklisted,
    })
    .from(schema.businesses)
    .where(and(
      inArray(schema.businesses.emailStatus, ['smtp_valid', 'mx_valid']),
    ));
  console.log(`\n=== ${emailValid.length} leads met email_status = smtp_valid/mx_valid ===`);
  for (const l of emailValid) {
    console.log(`  ${l.id.slice(0, 8)}… ${l.name} | ${l.city} | NACE ${l.nace} | ${l.email} | opt=${l.optOut} black=${l.blacklisted}`);
  }

  // 2. Audit_results gekoppeld aan businesses
  const withAudit = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      email: schema.businesses.email,
      emailStatus: schema.businesses.emailStatus,
      city: schema.businesses.city,
      nace: schema.businesses.naceCode,
      audited: schema.auditResults.id,
      pagespeed: schema.auditResults.pagespeedMobileScore,
      ssl: schema.auditResults.hasSsl,
      cms: schema.auditResults.detectedCms,
      ga: schema.auditResults.hasGoogleAnalytics,
    })
    .from(schema.businesses)
    .innerJoin(schema.auditResults, eq(schema.auditResults.businessId, schema.businesses.id));
  console.log(`\n=== ${withAudit.length} leads met audit_results ===`);
  for (const l of withAudit) {
    console.log(`  ${l.id.slice(0, 8)}… ${l.name} | ${l.city} | NACE ${l.nace} | email=${l.email ?? 'NULL'} status=${l.emailStatus} | cms=${l.cms} ssl=${l.ssl}`);
  }

  // 3. Overlap: email-valid + audit + VL postcode + target NACE
  const overlap = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      email: schema.businesses.email,
      city: schema.businesses.city,
      nace: schema.businesses.naceCode,
      cms: schema.auditResults.detectedCms,
    })
    .from(schema.businesses)
    .innerJoin(schema.auditResults, eq(schema.auditResults.businessId, schema.businesses.id))
    .innerJoin(schema.leadPipeline, eq(schema.leadPipeline.businessId, schema.businesses.id))
    .where(and(
      eq(schema.businesses.country, 'BE'),
      inArray(schema.businesses.emailStatus, ['smtp_valid', 'mx_valid']),
      eq(schema.businesses.optOut, false),
      eq(schema.businesses.blacklisted, false),
      eq(schema.leadPipeline.stage, 'new'),
      eq(schema.leadPipeline.frozen, false),
    ));
  console.log(`\n=== OVERLAP (email-valid + audit + stage=new): ${overlap.length} ===`);
  for (const l of overlap) {
    console.log(`  ${l.id.slice(0, 8)}… ${l.name} | ${l.city} | NACE ${l.nace} | ${l.email} | CMS=${l.cms}`);
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
