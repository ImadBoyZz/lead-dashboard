import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const promoted: any = await db.execute(sql`
    UPDATE businesses
    SET lead_temperature = 'warm',
        auto_promoted_at = NOW(),
        updated_at = NOW()
    WHERE lead_temperature = 'cold'
      AND auto_promoted_at IS NULL
      AND opt_out = false AND blacklisted = false
      AND website_verdict IN ('none', 'outdated', 'parked')
      AND email_status IN ('mx_valid', 'smtp_valid')
      AND (chain_classification IS NULL OR chain_classification IN ('independent', 'unknown'))
      AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')
      AND NOT EXISTS (
        SELECT 1 FROM lead_scores
        WHERE lead_scores.business_id = businesses.id AND lead_scores.disqualified = true
      )
    RETURNING id, name, website, email
  `);
  const rows = promoted.rows ?? promoted;
  console.log(`✓ ${rows.length} leads gepromoot naar warm:`);
  for (const r of rows) console.log(`  🔥 ${r.name.padEnd(35)} ${r.email} (${r.website})`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
