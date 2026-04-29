import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const r: any = await db.execute(sql`
    SELECT b.id, b.name, b.website, b.website_verdict, b.website_age_estimate,
           a.pagespeed_mobile_score, a.pagespeed_desktop_score
    FROM businesses b
    LEFT JOIN audit_results a ON a.business_id = b.id
    WHERE b.lead_temperature = 'warm'
      AND b.auto_promoted_at::date = CURRENT_DATE
    ORDER BY a.pagespeed_mobile_score DESC NULLS LAST
  `);
  console.log('id        | mobile | dt | verdict   | age | website (naam)');
  for (const r2 of (r.rows ?? r)) {
    console.log(`${r2.id.slice(0,8)} | ${String(r2.pagespeed_mobile_score ?? '?').padStart(6)} | ${String(r2.pagespeed_desktop_score ?? '?').padStart(2)} | ${(r2.website_verdict ?? '?').padEnd(9)} | ${String(r2.website_age_estimate ?? '?').padStart(3)} | ${r2.website} (${r2.name})`);
  }

  const recent: any = await db.execute(sql`
    SELECT created_at, ai_model, endpoint, ROUND(cost_estimate::numeric, 4) AS eur
    FROM ai_usage_log
    WHERE created_at > NOW() - INTERVAL '20 minutes' AND endpoint LIKE '%tiebreaker%'
    ORDER BY created_at DESC
  `);
  console.log(`\nTiebreaker calls laatste 20 min: ${(recent.rows ?? recent).length}`);
  for (const row of (recent.rows ?? recent))
    console.log(`  ${row.created_at} €${row.eur} ${row.ai_model}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
