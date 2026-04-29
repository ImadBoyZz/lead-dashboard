import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  // Tel chain_classification breakdown van cold leads (na onze run)
  const r: any = await db.execute(sql`
    SELECT chain_classification, COUNT(*)::int AS n
    FROM businesses
    WHERE lead_temperature = 'cold' AND blacklisted = false AND opt_out = false
    GROUP BY 1 ORDER BY n DESC
  `);
  console.log('chain_classification breakdown (cold + non-blacklist):');
  for (const row of (r.rows ?? r)) console.log(`  ${row.chain_classification ?? 'NULL'} → ${row.n}`);

  // Voor de leads die we net enriched: wat is hun chain_classification NU?
  const sample: any = await db.execute(sql`
    SELECT name, chain_classification, chain_classified_at, qualified_at, website_verdict, email_status
    FROM businesses
    WHERE lead_temperature = 'cold' AND blacklisted = false
      AND name IN ('Wim Rossie Bvba', 'OrhanSolar', 'Klimaterra', 'Service Loodgieter', 'Frank Facility Service', 'Sander Vervaet')
    ORDER BY name
  `);
  console.log('\nSample leads:');
  for (const row of (sample.rows ?? sample)) {
    console.log(`  ${row.name.padEnd(30)} chain=${row.chain_classification ?? 'NULL'} verdict=${row.website_verdict ?? 'NULL'} email=${row.email_status}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
