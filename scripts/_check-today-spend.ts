import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  const setting: any = await db.execute(sql`SELECT key, value, updated_at, updated_by FROM system_settings WHERE key IN ('daily_budget_eur', 'warmup_max_override', 'warmup_start_date')`);
  console.log('=== system_settings ===');
  for (const r of (setting.rows ?? setting)) console.log(`  ${r.key} = ${JSON.stringify(r.value)} (door ${r.updated_by} op ${r.updated_at})`);

  const ai: any = await db.execute(sql`
    SELECT
      ai_model,
      endpoint,
      created_at,
      ROUND(cost_estimate::numeric, 4) AS cost_eur
    FROM ai_usage_log
    WHERE created_at::date = CURRENT_DATE
    ORDER BY created_at DESC
  `);
  console.log(`\n=== AI calls vandaag (${(ai.rows ?? ai).length} stuks) ===`);
  let total = 0;
  for (const r of (ai.rows ?? ai)) {
    total += parseFloat(r.cost_eur);
    console.log(`  ${new Date(r.created_at).toISOString()}  €${r.cost_eur}  ${r.ai_model}  ${r.endpoint}`);
  }
  console.log(`\nTotaal vandaag: €${total.toFixed(4)}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
