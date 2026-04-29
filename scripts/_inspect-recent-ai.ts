import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const r: any = await db.execute(sql`
    SELECT created_at, ai_model, endpoint, ROUND(cost_estimate::numeric, 4) AS eur, business_id
    FROM ai_usage_log
    WHERE created_at > NOW() - INTERVAL '5 minutes'
    ORDER BY created_at DESC
  `);
  for (const row of (r.rows ?? r))
    console.log(`${row.created_at} €${row.eur} ${row.ai_model} ${row.endpoint} biz=${row.business_id?.slice(0,8) ?? '?'}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
