import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const r: any = await db.execute(sql`
    SELECT created_at, ai_model, endpoint, ROUND(cost_estimate::numeric, 4) AS eur
    FROM ai_usage_log
    WHERE ai_model = 'claude-opus-4-7'
      AND created_at > '2026-04-25 11:03:00'::timestamp
    ORDER BY created_at DESC
  `);
  const rows = r.rows ?? r;
  console.log(`Opus calls sinds deploy (11:03 UTC = 13:03 CET): ${rows.length}`);
  for (const row of rows) console.log(`  ${row.created_at}  €${row.eur}  ${row.endpoint}`);
  if (rows.length === 0) console.log('  → ✓ TIEBREAKER_ENABLED=false werkt');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
