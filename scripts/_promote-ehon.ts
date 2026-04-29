import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
const BEARER = 'ae882ad7d0d10a9780ce77faa5ef0e2768906170e0279821f61f48cdee8613bc';
const BASE = 'https://lead-dashboard-taupe.vercel.app';
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const r: any = await db.execute(sql`SELECT id, name FROM businesses WHERE name = 'Ehon services' LIMIT 1`);
  const ehon = (r.rows ?? r)[0];
  if (!ehon) { console.log('Ehon niet gevonden'); process.exit(1); }
  console.log(`Trigger full enrich op Ehon (${ehon.id.slice(0,8)})`);
  const res = await fetch(`${BASE}/api/enrich/full/${ehon.id}`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${BEARER}` },
  });
  const data = await res.json();
  console.log('status:', res.status);
  console.log('autoPromote:', JSON.stringify(data.autoPromote ?? data, null, 2).slice(0, 600));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
