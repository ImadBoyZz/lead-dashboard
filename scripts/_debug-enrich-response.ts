import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
const BEARER = 'ae882ad7d0d10a9780ce77faa5ef0e2768906170e0279821f61f48cdee8613bc';
const BASE = 'https://lead-dashboard-taupe.vercel.app';
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  // Pak een cold lead met website
  const r: any = await db.execute(sql`
    SELECT id, name, website, website_verdict, email_status FROM businesses
    WHERE lead_temperature = 'cold' AND blacklisted = false AND website IS NOT NULL
    AND email_status = 'unverified' AND website_verdict IS NULL
    LIMIT 1
  `);
  const lead = (r.rows ?? r)[0];
  console.log('Lead:', lead.name, lead.id);
  console.log('  website:', lead.website);
  console.log('  pre verdict:', lead.website_verdict, 'email:', lead.email_status);

  const res = await fetch(`${BASE}/api/enrich/full/${lead.id}`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${BEARER}` },
  });
  const data = await res.json();
  console.log('\nResponse status:', res.status);
  console.log('Response:', JSON.stringify(data, null, 2).slice(0, 2500));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
