// Forceer email re-finding voor de 22 outdated cold leads zonder valid email.
// Dan run enrich opnieuw — bij gelukte email + verdict OK = auto-promote.

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const BEARER = 'ae882ad7d0d10a9780ce77faa5ef0e2768906170e0279821f61f48cdee8613bc';
const BASE = 'https://lead-dashboard-taupe.vercel.app';
const TARGET_WARM = 10;
const RUN_CAP_EUR = 1.50;

(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  // Pak de outdated/none/parked cold leads zonder valid email
  const candidates: any = await db.execute(sql`
    SELECT b.id, b.name, b.website
    FROM businesses b
    WHERE b.lead_temperature = 'cold'
      AND b.opt_out = false AND b.blacklisted = false
      AND b.website IS NOT NULL
      AND b.website_verdict IN ('outdated', 'none', 'parked')
      AND b.email_status NOT IN ('mx_valid', 'smtp_valid')
      AND (b.chain_classification IS NULL OR b.chain_classification IN ('independent', 'unknown'))
      AND NOT EXISTS (
        SELECT 1 FROM lead_scores
        WHERE lead_scores.business_id = b.id AND lead_scores.disqualified = true
      )
    ORDER BY b.updated_at DESC
  `);
  const pool = candidates.rows ?? candidates;
  console.log(`Pool (outdated/none/parked + ongeldige email): ${pool.length} leads\n`);

  // Reset email-velden zodat email-step opnieuw probeert
  for (const lead of pool) {
    await db.execute(sql`
      UPDATE businesses
      SET email_status = 'unverified',
          email_status_updated_at = NULL,
          email_source = NULL
      WHERE id = ${lead.id}::uuid
    `);
  }
  console.log(`✓ Email idempotency cleared\n`);

  const preCost: any = await db.execute(sql`
    SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
  `);
  const preSpent = (preCost.rows ?? preCost)[0].spent;
  console.log(`Daily spend vóór run: €${preSpent.toFixed(4)}\n`);
  console.log(`=== Run enrich tot ${TARGET_WARM} warm of cap €${RUN_CAP_EUR} ===\n`);

  let warmReached = 0;
  const warmList: { name: string; verdict: string; email: string }[] = [];
  let processedCount = 0;

  for (const lead of pool) {
    if (warmReached >= TARGET_WARM) break;

    const cur: any = await db.execute(sql`
      SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
    `);
    if ((cur.rows ?? cur)[0].spent - preSpent >= RUN_CAP_EUR) {
      console.log(`\n→ Cap €${RUN_CAP_EUR} bereikt, stop.`);
      break;
    }

    processedCount++;
    const t = Date.now();
    const res = await fetch(`${BASE}/api/enrich/full/${lead.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BEARER}` },
    });
    const data: any = await res.json().catch(() => ({}));
    const promote = data.autoPromote?.status ?? '?';
    const ms = Date.now() - t;

    // Check post-enrich state
    const post: any = await db.execute(sql`
      SELECT website_verdict, email, email_status, lead_temperature
      FROM businesses WHERE id = ${lead.id}::uuid
    `);
    const p = (post.rows ?? post)[0];
    const tag = p.lead_temperature === 'warm' ? '🔥' : p.email_status === 'mx_valid' ? '✓' : '·';
    console.log(`  ${tag} [${processedCount}] ${lead.name.slice(0,30).padEnd(30)} verdict=${p.website_verdict?.padEnd(10)} email=${(p.email_status ?? '').padEnd(11)} promote=${promote.padEnd(20)} ${ms}ms`);

    if (p.lead_temperature === 'warm' || promote === 'promoted') {
      warmReached++;
      warmList.push({ name: lead.name, verdict: p.website_verdict, email: p.email ?? '?' });
    }
  }

  console.log('\n=== Eindstaat ===');
  console.log(`Verwerkt: ${processedCount}, Warm bereikt: ${warmReached}\n`);
  for (const w of warmList) console.log(`  🔥 ${w.name} — verdict=${w.verdict}, email=${w.email}`);

  const postCost: any = await db.execute(sql`
    SELECT COALESCE(SUM(cost_estimate), 0)::float8 AS spent FROM ai_usage_log WHERE created_at::date = CURRENT_DATE
  `);
  console.log(`\nCost-delta: €${((postCost.rows ?? postCost)[0].spent - preSpent).toFixed(4)}`);
  console.log(`Daily spend totaal: €${(postCost.rows ?? postCost)[0].spent.toFixed(4)}`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
