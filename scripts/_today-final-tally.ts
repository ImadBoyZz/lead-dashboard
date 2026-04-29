import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  const warm: any = await db.execute(sql`
    SELECT name, website, email, website_verdict
    FROM businesses
    WHERE lead_temperature = 'warm' AND blacklisted = false AND opt_out = false
      AND auto_promoted_at::date = CURRENT_DATE
    ORDER BY auto_promoted_at DESC
  `);
  console.log(`=== Vandaag warm gepromoot: ${(warm.rows ?? warm).length} ===`);
  for (const r of (warm.rows ?? warm))
    console.log(`  🔥 ${r.name.padEnd(40)} verdict=${r.website_verdict?.padEnd(8)} ${r.email ?? '(geen)'}`);

  const blacklist: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM businesses WHERE blacklisted = true AND updated_at::date = CURRENT_DATE
  `);
  console.log(`\n=== Vandaag geblacklist: ${(blacklist.rows ?? blacklist)[0].n} (modern verdicts) ===`);

  const dailySpend: any = await db.execute(sql`
    SELECT ROUND(SUM(cost_estimate)::numeric, 4) AS spent FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
  `);
  console.log(`\nDaily AI spend: €${(dailySpend.rows ?? dailySpend)[0].spent}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
