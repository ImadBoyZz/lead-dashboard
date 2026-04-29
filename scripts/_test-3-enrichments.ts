import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
const BEARER = 'ae882ad7d0d10a9780ce77faa5ef0e2768906170e0279821f61f48cdee8613bc';
const BASE = 'https://lead-dashboard-taupe.vercel.app';
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  // Pak 3 cold leads — willekeurig
  const r: any = await db.execute(sql`
    SELECT id, name, website, chain_classification FROM businesses
    WHERE lead_temperature = 'cold' AND blacklisted = false AND website IS NOT NULL
      AND chain_classification IN ('independent', 'unknown')
    ORDER BY RANDOM()
    LIMIT 3
  `);
  for (const lead of (r.rows ?? r)) {
    console.log(`\n=== ${lead.name} (chain=${lead.chain_classification}) ===`);
    const res = await fetch(`${BASE}/api/enrich/full/${lead.id}`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${BEARER}` },
    });
    const data: any = await res.json();
    console.log(`status: ${data.status}, reason: ${data.reason ?? '(none)'}`);
    console.log(`steps: ${JSON.stringify(data.steps?.map((s: any) => ({step: s.step, status: s.status, verdict: s.verdict})), null, 0)}`);
    if (data.autoPromote) console.log(`autoPromote: ${data.autoPromote.status}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
