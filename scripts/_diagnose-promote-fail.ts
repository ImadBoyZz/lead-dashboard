import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const r: any = await db.execute(sql`
    SELECT b.id, b.name, b.website, b.website_verdict, b.email, b.email_status,
           b.chain_classification, b.opt_out, b.blacklisted, b.google_business_status,
           ls.disqualified, ls.disqualify_reason
    FROM businesses b
    LEFT JOIN lead_scores ls ON ls.business_id = b.id
    WHERE b.name IN ('Sander Vervaet', 'Sani cv bvba', 'Toon Van Dorpe', 'Dillen BV - verwarming, koeling, sanitair')
      AND b.lead_temperature = 'cold'
    ORDER BY b.name
  `);
  console.log('Diagnose op outdated/none leads die NIET warm werden:\n');
  for (const row of (r.rows ?? r)) {
    console.log(`${row.name}`);
    console.log(`  verdict=${row.website_verdict}, email=${row.email_status}, email_addr=${row.email ?? 'NULL'}`);
    console.log(`  chain=${row.chain_classification}, gbs=${row.google_business_status ?? 'NULL'}`);
    console.log(`  disqualified=${row.disqualified}, reason=${row.disqualify_reason ?? 'NULL'}`);
    console.log(`  opt_out=${row.opt_out}, blacklisted=${row.blacklisted}`);
    console.log();
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
