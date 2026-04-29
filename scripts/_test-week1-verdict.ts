// Test van week-1 verdict-verbeteringen op de 5 sites die vandaag
// ten onrechte (volgens user) als warm werden geclassificeerd.
//
// Verwacht resultaat na fix:
//   - Rensol: 'modern' (geen tiebreaker, modern tech detected) of acceptable
//   - Saninetto: 'modern' of 'acceptable' (active maintenance detected)
//   - Frank Facility: 'acceptable' (active maintenance)
//   - Pauwels: blijft 'outdated' (formele copy, geen modern tech)
//   - Ehon: blijft 'outdated' (geen SSL)

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const BEARER = 'ae882ad7d0d10a9780ce77faa5ef0e2768906170e0279821f61f48cdee8613bc';
const BASE = 'https://lead-dashboard-taupe.vercel.app';

const TARGETS = [
  { name: 'Rensol', id: 'bb9fae74-' },
  { name: 'Frank Facility Service', id: '06b4aaa9-' },
  { name: 'Saninetto BV', id: 'e6efa7f1-' },
  { name: 'Pauwels Warmtetechniek', id: '5b8e0bc8-' },
  { name: 'Ehon services', id: '1db1f1dc-' },
];

(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  // Get full ids
  const r: any = await db.execute(sql`
    SELECT id, name, website FROM businesses
    WHERE name IN ('Rensol', 'Frank Facility Service', 'Saninetto BV', 'Pauwels Warmtetechniek', 'Ehon services')
    ORDER BY name
  `);
  const rows = r.rows ?? r;
  console.log(`=== ${rows.length} target leads ===\n`);

  // Clear verdict + run enrich
  for (const lead of rows) {
    await db.execute(sql`
      UPDATE businesses
      SET website_verdict = NULL, website_verdict_at = NULL, website_age_estimate = NULL,
          lead_temperature = 'cold', auto_promoted_at = NULL, updated_at = NOW()
      WHERE id = ${lead.id}::uuid
    `);
  }
  console.log('✓ Verdicts cleared, leads → cold\n');

  console.log('=== Re-enrich website-stap met nieuwe logica ===\n');
  for (const lead of rows) {
    const t = Date.now();
    const r2 = await fetch(`${BASE}/api/enrich/website/${lead.id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${BEARER}`, 'Content-Type': 'application/json' },
    });
    const data = await r2.text();
    let verdict = '?', reason = '', tiebreaker = '';
    try {
      const json = JSON.parse(data);
      verdict = json.verdict ?? '?';
      reason = json.reason ?? '';
      const tbStep = json.trail?.find((s: any) => s.step === 'tiebreaker');
      if (tbStep) {
        tiebreaker = `tb:${tbStep.verdict}→${tbStep.gatedVerdict ?? tbStep.verdict} conf=${tbStep.confidence?.toFixed(2)} maint=[${(tbStep.activeMaintenanceSignals ?? []).join(',')}]`;
      }
      const skipped = json.trail?.find((s: any) => s.step === 'tiebreaker_skipped');
      if (skipped) tiebreaker = `[skipped: ${skipped.reason}]`;
    } catch { reason = data.slice(0, 150); }
    console.log(`${lead.name.padEnd(28)} → ${verdict.padEnd(11)} (${Date.now()-t}ms)`);
    console.log(`  reason: ${reason.slice(0, 100)}`);
    if (tiebreaker) console.log(`  ${tiebreaker}`);
  }

  // Show modern indicators per lead via direct test
  console.log('\n=== Modern indicators check ===');
  const { collectWebsiteSignals } = await import('../src/lib/enrich/website-signals');
  for (const lead of rows) {
    try {
      const sig = await collectWebsiteSignals(lead.website ?? '');
      console.log(`${lead.name.padEnd(28)} ssl=${sig.hasSsl} mobile=${sig.pagespeedMobile} modern=[${sig.modernIndicators.join(',')}]`);
    } catch (e: any) { console.log(`  ${lead.name}: error ${e.message}`); }
  }

  // Eindstaat: hoeveel leads zijn warm vandaag
  const final: any = await db.execute(sql`
    SELECT b.name, b.website_verdict, b.lead_temperature
    FROM businesses b
    WHERE b.name IN ('Rensol', 'Frank Facility Service', 'Saninetto BV', 'Pauwels Warmtetechniek', 'Ehon services')
    ORDER BY b.name
  `);
  console.log('\n=== Eindstaat ===');
  for (const f of (final.rows ?? final))
    console.log(`  ${f.name.padEnd(28)} verdict=${f.website_verdict ?? '?'} temp=${f.lead_temperature}`);

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
