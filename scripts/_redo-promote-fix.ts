// Vervolg: herstel email_status en re-run auto-promote criteria check
// op de 10 leads. Bevestigt of de Variant A2 pipeline ze terug naar warm zet.

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const TARGET_IDS = [
  '55ac499b-99e5-41f6-863f-e6fa291376d7',
  'd029ffd6-cc59-42e6-8e01-d35c9f6e1b49',
  '098dc1df-8bba-4cbb-860b-9e86eaa4c26a',
  '9a86778b-46c4-4f1b-86e3-12310357f59f',
  '4d0da0ad-1e5f-4b57-854c-2e40e2759d11',
  '4683a64a-8bf4-4882-a505-83d1e17d9878',
  'ce76d35a-ea24-43ab-bce7-cb102f80da0c',
  'fac0e6d0-a191-489e-b5cf-c76698ce69ec',
  '858b7c7c-e63f-459c-88bd-ffc6470933f9',
  '698e4b0d-803d-4765-97c3-69228811927b',
];

(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const idsArr = sql.raw(`ARRAY[${TARGET_IDS.map(id => `'${id}'::uuid`).join(',')}]`);

  console.log('=== Stap 1: Herstel email_status = mx_valid (waren al gevalideerd vóór reset) ===');
  await db.execute(sql`
    UPDATE businesses
    SET email_status = 'mx_valid', updated_at = NOW()
    WHERE id = ANY(${idsArr})
  `);
  console.log('  ✓ 10 leads → email_status = mx_valid');

  console.log('\n=== Stap 2: Auto-promote criteria check (zelfde SQL als tryAutoPromote) ===');
  const promoted: any = await db.execute(sql`
    UPDATE businesses
    SET lead_temperature = 'warm',
        auto_promoted_at = NOW(),
        updated_at = NOW()
    WHERE id = ANY(${idsArr})
      AND lead_temperature = 'cold'
      AND auto_promoted_at IS NULL
      AND opt_out = false
      AND blacklisted = false
      AND website_verdict IN ('none', 'outdated', 'parked')
      AND email_status IN ('mx_valid', 'smtp_valid')
      AND (chain_classification IS NULL OR chain_classification IN ('independent', 'unknown'))
      AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')
      AND NOT EXISTS (
        SELECT 1 FROM lead_scores
        WHERE lead_scores.business_id = businesses.id
          AND lead_scores.disqualified = true
      )
    RETURNING id, name, website_verdict
  `);
  const rows = promoted.rows ?? promoted;
  console.log(`  ✓ ${rows.length} leads gepromoot:`);
  for (const r of rows) console.log(`    ${r.id.slice(0,8)} ${r.name} (verdict=${r.website_verdict})`);

  // Eindstaat
  const final: any = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE lead_temperature = 'warm') AS warm,
      COUNT(*) FILTER (WHERE lead_temperature = 'cold') AS cold
    FROM businesses
    WHERE id = ANY(${idsArr})
  `);
  const f = (final.rows ?? final)[0];
  console.log(`\n=== Eindstaat: ${f.warm} warm / ${f.cold} cold (van ${TARGET_IDS.length} totaal) ===`);

  // Cost summary
  const cost: any = await db.execute(sql`
    SELECT ROUND(SUM(cost_estimate)::numeric, 4) AS spent
    FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
  `);
  console.log(`Daily AI spend totaal: €${(cost.rows ?? cost)[0].spent}`);

  const opus: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM ai_usage_log
    WHERE ai_model = 'claude-opus-4-7' AND created_at > '2026-04-25 11:03:00'::timestamp
  `);
  console.log(`Opus calls sinds Variant A2 deploy: ${(opus.rows ?? opus)[0].n}`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
