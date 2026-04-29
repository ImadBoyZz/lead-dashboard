// V2: clear website-verdict idempotency timestamps eerst, dan enrich.
// Stop bij 10 warm of run-cap.

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const BEARER = 'ae882ad7d0d10a9780ce77faa5ef0e2768906170e0279821f61f48cdee8613bc';
const BASE = 'https://lead-dashboard-taupe.vercel.app';
const TARGET_WARM = 10;
const RUN_CAP_EUR = 2.50;
const ENRICH_LIMIT = 50;

(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  // Pool: cold + non-blacklist + non-modern + heeft website + non-disqualified
  const candidates: any = await db.execute(sql`
    SELECT b.id, b.name, b.website
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
    ORDER BY b.updated_at DESC
    LIMIT ${ENRICH_LIMIT}
  `);
  const pool = candidates.rows ?? candidates;
  console.log(`Pool: ${pool.length} kandidaten\n`);

  // Clear idempotency velden zodat website-stap opnieuw draait
  for (const lead of pool) {
    await db.execute(sql`
      UPDATE businesses
      SET website_verdict = NULL,
          website_verdict_at = NULL,
          website_age_estimate = NULL
      WHERE id = ${lead.id}::uuid
    `);
  }
  console.log(`✓ Verdict timestamps cleared op ${pool.length} leads\n`);

  // Cost baseline
  const preCost: any = await db.execute(sql`
    SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent
    FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
  `);
  const preSpent = (preCost.rows ?? preCost)[0].spent;
  console.log(`Daily spend vóór run: €${preSpent.toFixed(4)}\n`);
  console.log(`=== Enrich loop (target ${TARGET_WARM} warm, cap €${RUN_CAP_EUR}) ===\n`);

  let warmReached = 0;
  const counts = { modern: 0, acceptable: 0, outdated: 0, none: 0, parked: 0, other: 0, err: 0 };
  let processedCount = 0;
  const blacklistIds: string[] = [];
  const warmLeads: { id: string; name: string; verdict: string }[] = [];

  for (const lead of pool) {
    if (warmReached >= TARGET_WARM) {
      console.log(`\n→ ${TARGET_WARM} warm bereikt, stop.`);
      break;
    }

    const cur: any = await db.execute(sql`
      SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent
      FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
    `);
    const spent = (cur.rows ?? cur)[0].spent;
    if (spent - preSpent >= RUN_CAP_EUR) {
      console.log(`\n→ Cap €${RUN_CAP_EUR} bereikt, stop.`);
      break;
    }

    processedCount++;
    const t = Date.now();
    const res = await fetch(`${BASE}/api/enrich/full/${lead.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BEARER}`, 'Content-Type': 'application/json' },
    });
    const data: any = await res.json().catch(() => ({}));

    // Lees verdict uit response of opnieuw uit DB
    let verdict: string | null = null;
    const websiteStep = data.steps?.find((s: any) => s.step === 'website');
    verdict = websiteStep?.summary?.verdict ?? null;
    if (!verdict) {
      const dbCheck: any = await db.execute(sql`
        SELECT website_verdict FROM businesses WHERE id = ${lead.id}::uuid
      `);
      verdict = (dbCheck.rows ?? dbCheck)[0]?.website_verdict ?? '?';
    }

    const promote = data.autoPromote?.status ?? data.status ?? '?';
    const ms = Date.now() - t;

    let tag = '?';
    if (verdict === 'modern') { counts.modern++; tag = '🚫'; blacklistIds.push(lead.id); }
    else if (verdict === 'acceptable') { counts.acceptable++; tag = '⏸'; }
    else if (verdict === 'outdated') { counts.outdated++; tag = '✓'; }
    else if (verdict === 'none') { counts.none++; tag = '✓'; }
    else if (verdict === 'parked') { counts.parked++; tag = '✓'; }
    else { counts.other++; }

    if (promote === 'promoted') {
      warmReached++;
      warmLeads.push({ id: lead.id, name: lead.name, verdict: verdict ?? '?' });
    }

    console.log(`  ${tag} [${processedCount}/${ENRICH_LIMIT}] ${lead.name.slice(0,32).padEnd(32)} verdict=${(verdict ?? '?').padEnd(10)} promote=${String(promote).padEnd(20)} ${ms}ms`);
  }

  // Blacklist alle modern leads
  if (blacklistIds.length > 0) {
    await db.execute(sql`
      UPDATE businesses SET blacklisted = true, updated_at = NOW()
      WHERE id = ANY(${sql.raw(`ARRAY[${blacklistIds.map(id => `'${id}'::uuid`).join(',')}]`)})
    `);
  }

  // Eindstaat
  console.log('\n=== Eindstaat ===');
  console.log(`Verwerkt: ${processedCount}`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`Warm gepromoot: ${warmReached}`);
  for (const w of warmLeads) console.log(`  ✓ ${w.name} (verdict=${w.verdict})`);
  console.log(`\nGeblacklist deze run: ${blacklistIds.length}`);

  const postCost: any = await db.execute(sql`
    SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent
    FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
  `);
  const postSpent = (postCost.rows ?? postCost)[0].spent;
  console.log(`\nCost-delta: €${(postSpent - preSpent).toFixed(4)}`);
  console.log(`Daily spend totaal: €${postSpent.toFixed(4)}`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
