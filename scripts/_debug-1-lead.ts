import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
const BEARER = 'ae882ad7d0d10a9780ce77faa5ef0e2768906170e0279821f61f48cdee8613bc';
const BASE = 'https://lead-dashboard-taupe.vercel.app';
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const r: any = await db.execute(sql`SELECT id, name, website, email_status, email_status_updated_at, email_source FROM businesses WHERE name = 'Sander Vervaet'`);
  const lead = (r.rows ?? r)[0];
  console.log('Pre-state:', JSON.stringify({ ...lead, id: lead.id.slice(0,8) }, null, 2));

  const res = await fetch(`${BASE}/api/enrich/full/${lead.id}`, { method: 'POST', headers: { 'Authorization': `Bearer ${BEARER}` } });
  const data: any = await res.json();
  console.log('\nResponse:', JSON.stringify(data, null, 2).slice(0, 1500));

  const r2: any = await db.execute(sql`SELECT email, email_status, email_source, email_status_updated_at FROM businesses WHERE name = 'Sander Vervaet'`);
  console.log('\nPost-state:', JSON.stringify((r2.rows ?? r2)[0], null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
