import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  const ai: any = await db.execute(sql`
    SELECT
      ai_model,
      endpoint,
      COUNT(*)::int AS calls,
      ROUND(SUM(cost_estimate)::numeric, 4) AS cost_eur,
      ROUND(AVG(cost_estimate)::numeric, 4) AS cost_per_call
    FROM ai_usage_log
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY 1, 2 ORDER BY cost_eur DESC LIMIT 20
  `);
  console.log('=== AI cost laatste 30 dagen (per model+endpoint) ===');
  for (const r of (ai.rows ?? ai))
    console.log(`  €${r.cost_eur} | ${r.calls}× ${r.ai_model} @ ${r.endpoint} (avg €${r.cost_per_call}/call)`);

  const totalAi: any = await db.execute(sql`
    SELECT ROUND(SUM(cost_estimate)::numeric, 2) AS total_30d
    FROM ai_usage_log WHERE created_at > NOW() - INTERVAL '30 days'
  `);
  console.log(`\nTotaal AI 30d: €${(totalAi.rows ?? totalAi)[0]?.total_30d ?? 0}`);

  const places: any = await db.execute(sql`
    SELECT
      run_date,
      COALESCE((metadata->>'apiQueries')::int, 0) AS api_queries,
      COALESCE(input_count, 0) AS candidates,
      COALESCE(output_count, 0) AS inserted
    FROM batch_runs
    WHERE job_type = 'discover' AND status = 'ok'
      AND run_date > CURRENT_DATE - INTERVAL '30 days'
    ORDER BY run_date DESC LIMIT 30
  `);
  console.log('\n=== Discovery batches laatste 30 dagen ===');
  let totalQueries = 0;
  for (const r of (places.rows ?? places)) {
    totalQueries += r.api_queries;
    console.log(`  ${r.run_date}: ${r.api_queries} API queries → ${r.candidates} candidates → ${r.inserted} inserted`);
  }
  // Text Search ~$0.032 per call. Conservatief: alle queries = Text Search.
  const placesEur = (totalQueries * 0.032 * 0.92).toFixed(2);
  console.log(`\nGoogle Places kost (geschat, 30d): ~€${placesEur} (${totalQueries} queries)`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
