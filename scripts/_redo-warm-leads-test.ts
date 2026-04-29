// Test van Variant A2 pipeline:
//   1. Toon de leads die vandaag auto-gepromoot zijn naar warm
//   2. Reset hun lead_temperature → 'cold' + auto_promoted_at → NULL
//   3. Reset website_verdict + email_status zodat enrichment opnieuw draait
//      met TIEBREAKER_ENABLED=false (geen Opus call meer)
//   4. Run enrichment opnieuw via /api/enrich/full/[id] op productie
//   5. Toon hoeveel weer warm zijn + welk verdict ze kregen + cost diff
//
// Hard limit: max 10 leads om budget te beschermen.

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const BEARER = 'ae882ad7d0d10a9780ce77faa5ef0e2768906170e0279821f61f48cdee8613bc';
const BASE = 'https://lead-dashboard-taupe.vercel.app';
const MAX = 10;

(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  // Stap 1: identificeer
  const todays: any = await db.execute(sql`
    SELECT id, name, website, website_verdict, email_status, auto_promoted_at
    FROM businesses
    WHERE auto_promoted_at::date = CURRENT_DATE
      AND lead_temperature = 'warm'
    ORDER BY auto_promoted_at DESC
    LIMIT ${MAX}
  `);
  const rows = todays.rows ?? todays;
  console.log(`=== Stap 1: ${rows.length} warm leads van vandaag ===`);
  for (const r of rows) console.log(`  ${r.id.slice(0,8)} ${r.name} | verdict=${r.website_verdict} email=${r.email_status}`);
  if (rows.length === 0) { console.log('Geen leads om te resetten. Klaar.'); process.exit(0); }

  const ids = rows.map((r: any) => r.id);

  // Stap 2+3: reset
  console.log('\n=== Stap 2-3: reset naar cold + clear enrichment velden ===');
  await db.execute(sql`
    UPDATE businesses
    SET lead_temperature = 'cold',
        auto_promoted_at = NULL,
        website_verdict = NULL,
        website_verdict_at = NULL,
        website_age_estimate = NULL,
        email_status = 'unverified',
        updated_at = NOW()
    WHERE id = ANY(${sql.raw(`ARRAY[${ids.map((id: string) => `'${id}'::uuid`).join(',')}]`)})
  `);
  console.log(`  ✓ ${ids.length} leads gereset`);

  // Stap 4: re-enrich via API onder Variant A2 regime
  console.log('\n=== Stap 4: re-enrichment via productie (TIEBREAKER_ENABLED=false) ===');
  const startCost: any = await db.execute(sql`
    SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
  `);
  const startSpent = (startCost.rows ?? startCost)[0].spent;

  let ok = 0, err = 0;
  for (const id of ids) {
    const t = Date.now();
    const r = await fetch(`${BASE}/api/enrich/full/${id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BEARER}`, 'Content-Type': 'application/json' },
    });
    const status = r.status;
    const text = await r.text();
    const ms = Date.now() - t;
    if (r.ok) {
      ok++;
      // parse JSON if possible
      try {
        const json = JSON.parse(text);
        const verdict = json.steps?.find((s: any) => s.step === 'website')?.verdict ?? json.websiteVerdict ?? '?';
        const promoted = json.autoPromote?.status ?? '?';
        console.log(`  ✓ ${id.slice(0,8)} ${ms}ms verdict=${verdict} promote=${promoted}`);
      } catch { console.log(`  ✓ ${id.slice(0,8)} ${ms}ms (geen JSON)`); }
    } else {
      err++;
      console.log(`  ✗ ${id.slice(0,8)} ${status} ${text.slice(0, 200)}`);
    }
  }
  console.log(`\nklaar: ok=${ok} err=${err}`);

  // Stap 5: eindstaat
  const endCost: any = await db.execute(sql`
    SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
  `);
  const endSpent = (endCost.rows ?? endCost)[0].spent;
  console.log(`\nCost-delta van re-enrichment: €${(endSpent - startSpent).toFixed(4)}`);

  const opusCheck: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM ai_usage_log
    WHERE ai_model = 'claude-opus-4-7' AND created_at > NOW() - INTERVAL '5 minutes'
  `);
  const opusCount = (opusCheck.rows ?? opusCheck)[0].n;
  console.log(`Opus calls in laatste 5 min: ${opusCount} (verwacht: 0)`);

  const final: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM businesses
    WHERE id = ANY(${sql.raw(`ARRAY[${ids.map((id: string) => `'${id}'::uuid`).join(',')}]`)})
      AND lead_temperature = 'warm'
  `);
  const warmCount = (final.rows ?? final)[0].n;
  console.log(`\n=== Eindstaat: ${warmCount} / ${ids.length} weer warm ===`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
