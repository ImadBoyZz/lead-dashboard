import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  const total: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM businesses
    WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false
  `);
  console.log(`Cold leads (non-opt-out, non-blacklisted): ${(total.rows ?? total)[0].n}`);

  const breakdown: any = await db.execute(sql`
    SELECT website_verdict, email_status, COUNT(*)::int AS n
    FROM businesses
    WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false
    GROUP BY 1, 2 ORDER BY n DESC
  `);
  console.log('\nBreakdown per verdict + email_status:');
  for (const r of (breakdown.rows ?? breakdown))
    console.log(`  verdict=${r.website_verdict ?? 'NULL'} email=${r.email_status ?? 'NULL'} → ${r.n} leads`);

  // Cold leads die KANS hebben om warm te worden:
  // - email_status = mx_valid OR smtp_valid
  // - website beschikbaar (anders verdict = none mogelijk goed)
  const promotable: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM businesses
    WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false
      AND email_status IN ('mx_valid', 'smtp_valid')
      AND chain_classification IN ('independent', 'unknown')
      AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')
      AND NOT EXISTS (
        SELECT 1 FROM lead_scores
        WHERE lead_scores.business_id = businesses.id AND lead_scores.disqualified = true
      )
  `);
  console.log(`\nCold leads die voldoen aan ALLE non-verdict criteria: ${(promotable.rows ?? promotable)[0].n}`);
  console.log('  → dit is de pool voor re-enrichment + auto-promote test');

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
