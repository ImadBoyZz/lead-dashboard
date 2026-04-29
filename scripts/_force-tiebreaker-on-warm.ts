import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const BEARER = 'ae882ad7d0d10a9780ce77faa5ef0e2768906170e0279821f61f48cdee8613bc';
const BASE = 'https://lead-dashboard-taupe.vercel.app';

(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  const warm: any = await db.execute(sql`
    SELECT id, name, website FROM businesses
    WHERE lead_temperature = 'warm' AND auto_promoted_at::date = CURRENT_DATE
  `);
  const rows = warm.rows ?? warm;
  console.log(`Force re-enrich op ${rows.length} warm leads van vandaag\n`);

  // Clear website verdict om enrichment te forceren
  for (const lead of rows) {
    await db.execute(sql`
      UPDATE businesses SET website_verdict = NULL, website_verdict_at = NULL, website_age_estimate = NULL
      WHERE id = ${lead.id}::uuid
    `);
  }
  console.log('✓ Website verdicts cleared\n');

  // Re-enrich via /api/enrich/website (alleen website-stap, niet full)
  console.log('=== Re-enrich website-stap per lead (TIEBREAKER_ENABLED=true) ===');
  for (const lead of rows) {
    const t = Date.now();
    const r = await fetch(`${BASE}/api/enrich/website/${lead.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BEARER}`, 'Content-Type': 'application/json' },
    });
    const data = await r.text();
    let info = '';
    try {
      const json = JSON.parse(data);
      const verdict = json.verdict ?? '?';
      const reason = (json.reason ?? '').slice(0, 80);
      const trail = json.trail?.find((t: any) => t.step === 'tiebreaker' || t.step === 'tiebreaker_skipped');
      info = `verdict=${verdict} reason="${reason}"${trail ? ' [tiebreaker:' + (trail.verdict ?? trail.reason) + ']' : ''}`;
    } catch { info = `(${r.status}) ${data.slice(0, 150)}`; }
    console.log(`  ${lead.id.slice(0,8)} ${lead.website} (${Date.now()-t}ms)\n    ${info}`);
  }

  console.log('\n=== Tiebreaker calls deze run ===');
  const calls: any = await db.execute(sql`
    SELECT created_at, ai_model, ROUND(cost_estimate::numeric, 4) AS eur, business_id
    FROM ai_usage_log
    WHERE created_at > NOW() - INTERVAL '3 minutes' AND endpoint LIKE '%tiebreaker%'
    ORDER BY created_at DESC
  `);
  for (const c of (calls.rows ?? calls))
    console.log(`  €${c.eur} ${c.ai_model} biz=${c.business_id?.slice(0,8)}`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
