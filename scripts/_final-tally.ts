import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  const stats: any = await db.execute(sql`
    SELECT
      lead_temperature,
      blacklisted,
      website_verdict,
      COUNT(*)::int AS n
    FROM businesses
    WHERE opt_out = false
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
  `);
  console.log('=== Lead pool breakdown ===');
  for (const r of (stats.rows ?? stats)) {
    console.log(`  temp=${r.lead_temperature ?? 'NULL'} blacklisted=${r.blacklisted} verdict=${r.website_verdict ?? 'NULL'} → ${r.n}`);
  }

  const todayBlacklist: any = await db.execute(sql`
    SELECT name, website, website_verdict
    FROM businesses
    WHERE blacklisted = true AND updated_at::date = CURRENT_DATE
    ORDER BY name
  `);
  console.log(`\n=== ${(todayBlacklist.rows ?? todayBlacklist).length} leads vandaag geblacklist ===`);
  for (const r of (todayBlacklist.rows ?? todayBlacklist).slice(0, 35)) console.log(`  ${r.name} — verdict=${r.website_verdict} (${r.website})`);

  const warmAlive: any = await db.execute(sql`
    SELECT name, website_verdict, website FROM businesses
    WHERE lead_temperature = 'warm' AND blacklisted = false AND opt_out = false
    ORDER BY name
  `);
  console.log(`\n=== Huidige warm leads (totaal): ${(warmAlive.rows ?? warmAlive).length} ===`);
  for (const r of (warmAlive.rows ?? warmAlive)) console.log(`  ${r.name} — ${r.website_verdict} (${r.website})`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
