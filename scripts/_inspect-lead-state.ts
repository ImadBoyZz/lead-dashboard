import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const r: any = await db.execute(sql`
    SELECT id, name, website, website_verdict, website_verdict_at, website_age_estimate,
           email, email_status, lead_temperature, auto_promoted_at,
           chain_classification, kbo_matched_at, google_places_enriched_at, opt_out, blacklisted
    FROM businesses
    WHERE id = '55ac499b-99e5-41f6-863f-e6fa291376d7'
  `);
  console.log(JSON.stringify((r.rows ?? r)[0], null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
