// Extract 10 warm leads uit huidige cold pool, blacklist modern sites.
//
// Stage 1: Blacklist alle leads met website_verdict='modern' (al geclassificeerd).
// Stage 2: Loop door cold leads (verdict NULL, prefer mx_valid email als bekend),
//          run /api/enrich/full per stuk. Stop bij 10 warm OR budget cap (€2.50 vandaag).
// Stage 3: Voor lead die als 'modern' eindigt na enrich → blacklist.

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const BEARER = 'ae882ad7d0d10a9780ce77faa5ef0e2768906170e0279821f61f48cdee8613bc';
const BASE = 'https://lead-dashboard-taupe.vercel.app';
const TARGET_WARM = 10;
const BUDGET_CAP_EUR = 2.50; // hard cap voor deze run, ongeacht daily setting
const ENRICH_LIMIT = 60;     // max enrichments deze run

(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  // ── Stage 1: Blacklist al-geclassificeerde 'modern' leads ────
  console.log('=== Stage 1: Blacklist modern leads ===');
  const modernRes: any = await db.execute(sql`
    UPDATE businesses
    SET blacklisted = true, updated_at = NOW()
    WHERE lead_temperature = 'cold' AND blacklisted = false
      AND website_verdict = 'modern'
    RETURNING id, name, website
  `);
  const blacklisted1 = modernRes.rows ?? modernRes;
  console.log(`  ✓ ${blacklisted1.length} modern leads → blacklisted`);
  for (const r of blacklisted1) console.log(`    - ${r.name} (${r.website})`);

  // Tel huidige warm
  const startWarm: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM businesses WHERE lead_temperature = 'warm'
  `);
  const startWarmCount = (startWarm.rows ?? startWarm)[0].n;
  console.log(`\nStart-staat: ${startWarmCount} warm leads totaal`);

  // ── Stage 2: Enrich cold leads ────
  console.log(`\n=== Stage 2: Enrich tot ${TARGET_WARM} warm of cap (€${BUDGET_CAP_EUR} of ${ENRICH_LIMIT} enrich) ===`);

  // Pak cold leads met grootste kans op warm: heeft website + niet modern + niet disqualified
  const candidates: any = await db.execute(sql`
    SELECT b.id, b.name, b.website, b.email_status, b.website_verdict
    FROM businesses b
    WHERE b.lead_temperature = 'cold'
      AND b.opt_out = false AND b.blacklisted = false
      AND b.website IS NOT NULL
      AND (b.website_verdict IS NULL OR b.website_verdict NOT IN ('modern'))
      AND (b.chain_classification IS NULL OR b.chain_classification IN ('independent', 'unknown'))
      AND NOT EXISTS (
        SELECT 1 FROM lead_scores
        WHERE lead_scores.business_id = b.id AND lead_scores.disqualified = true
      )
    ORDER BY
      CASE WHEN b.email_status IN ('mx_valid', 'smtp_valid') THEN 0 ELSE 1 END,
      b.updated_at DESC
    LIMIT ${ENRICH_LIMIT}
  `);
  const pool = candidates.rows ?? candidates;
  console.log(`Pool: ${pool.length} kandidaten`);

  // Cost-baseline pre-run
  const preCost: any = await db.execute(sql`
    SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent
    FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
  `);
  const preSpent = (preCost.rows ?? preCost)[0].spent;
  console.log(`Daily spend vóór run: €${preSpent.toFixed(4)}\n`);

  let warmReached = 0;
  let modernCount = 0;
  let acceptableCount = 0;
  let outdatedCount = 0;
  let noneCount = 0;
  let parkedCount = 0;
  let errCount = 0;
  let processedCount = 0;

  for (const lead of pool) {
    if (warmReached >= TARGET_WARM) {
      console.log(`\n→ ${TARGET_WARM} warm bereikt, stop.`);
      break;
    }

    // Budget check
    const cur: any = await db.execute(sql`
      SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent
      FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
    `);
    const spent = (cur.rows ?? cur)[0].spent;
    if (spent - preSpent >= BUDGET_CAP_EUR) {
      console.log(`\n→ Run-cap €${BUDGET_CAP_EUR} bereikt (uitgegeven €${(spent - preSpent).toFixed(2)}), stop.`);
      break;
    }

    processedCount++;
    const t = Date.now();
    const res = await fetch(`${BASE}/api/enrich/full/${lead.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BEARER}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      errCount++;
      console.log(`  ✗ ${lead.name.slice(0,30).padEnd(30)} HTTP ${res.status}`);
      continue;
    }
    const data: any = await res.json().catch(() => ({}));
    const promote = data.autoPromote?.status ?? '?';
    const websiteStep = data.steps?.find((s: any) => s.step === 'website');
    const verdict = websiteStep?.verdict ?? data.websiteVerdict ?? '?';
    const ms = Date.now() - t;

    const tag = verdict === 'modern' ? '🚫' : verdict === 'outdated' || verdict === 'none' || verdict === 'parked' ? '✓' : '?';
    console.log(`  ${tag} ${lead.name.slice(0,30).padEnd(30)} verdict=${verdict.padEnd(11)} promote=${promote.padEnd(20)} (${ms}ms)`);

    // Counts
    if (verdict === 'modern') modernCount++;
    else if (verdict === 'acceptable') acceptableCount++;
    else if (verdict === 'outdated') outdatedCount++;
    else if (verdict === 'none') noneCount++;
    else if (verdict === 'parked') parkedCount++;

    if (promote === 'promoted') warmReached++;

    // Auto-blacklist als modern
    if (verdict === 'modern') {
      await db.execute(sql`
        UPDATE businesses SET blacklisted = true, updated_at = NOW()
        WHERE id = ${lead.id}::uuid
      `);
    }
  }

  // ── Stage 3: Eindstaat ────
  console.log('\n=== Eindstaat ===');
  console.log(`Verwerkt: ${processedCount} leads`);
  console.log(`  → modern (geblacklist): ${modernCount}`);
  console.log(`  → acceptable: ${acceptableCount}`);
  console.log(`  → outdated: ${outdatedCount}`);
  console.log(`  → none: ${noneCount}`);
  console.log(`  → parked: ${parkedCount}`);
  console.log(`  → errors: ${errCount}`);
  console.log(`Warm gepromoot: ${warmReached}`);

  const totalBlacklisted: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM businesses WHERE blacklisted = true AND updated_at::date = CURRENT_DATE
  `);
  console.log(`Totaal vandaag geblacklist: ${(totalBlacklisted.rows ?? totalBlacklisted)[0].n} (incl. stage 1)`);

  const postCost: any = await db.execute(sql`
    SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent
    FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
  `);
  const postSpent = (postCost.rows ?? postCost)[0].spent;
  console.log(`\nCost-delta deze run: €${(postSpent - preSpent).toFixed(4)}`);
  console.log(`Daily spend totaal: €${postSpent.toFixed(4)}`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
