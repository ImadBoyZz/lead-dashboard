import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
const TARGET = [
  '55ac499b-99e5-41f6-863f-e6fa291376d7','d029ffd6-cc59-42e6-8e01-d35c9f6e1b49',
  '098dc1df-8bba-4cbb-860b-9e86eaa4c26a','9a86778b-46c4-4f1b-86e3-12310357f59f',
  '4d0da0ad-1e5f-4b57-854c-2e40e2759d11','4683a64a-8bf4-4882-a505-83d1e17d9878',
  'ce76d35a-ea24-43ab-bce7-cb102f80da0c','fac0e6d0-a191-489e-b5cf-c76698ce69ec',
  '858b7c7c-e63f-459c-88bd-ffc6470933f9','698e4b0d-803d-4765-97c3-69228811927b',
];
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const r: any = await db.execute(sql`
    SELECT b.id, b.name, b.website, b.website_verdict, b.pagespeed_mobile_score, b.has_ssl, b.website_age_estimate
    FROM businesses b
    WHERE b.id = ANY(${sql.raw(`ARRAY[${TARGET.map(id => `'${id}'::uuid`).join(',')}]`)})
    ORDER BY b.pagespeed_mobile_score DESC NULLS LAST
  `);
  console.log('id        | mobile | ssl | verdict   | website                              | naam');
  for (const r2 of (r.rows ?? r)) {
    console.log(`${r2.id.slice(0,8)} | ${String(r2.pagespeed_mobile_score ?? '?').padStart(6)} | ${r2.has_ssl ? 'yes' : 'no '} | ${(r2.website_verdict ?? '?').padEnd(9)} | ${(r2.website ?? '').padEnd(36).slice(0,36)} | ${r2.name}`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
