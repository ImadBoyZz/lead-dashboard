import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const r: any = await db.execute(sql`SELECT COUNT(*)::int AS n FROM kbo_lookup`);
  const total = (r.rows ?? r)[0]?.n ?? 0;
  console.log(`kbo_lookup totaal: ${total}`);
  const naceTop: any = await db.execute(sql`
    SELECT LEFT(nace_code, 2) AS nace_2, COUNT(*)::int AS n
    FROM kbo_lookup
    WHERE nace_code IS NOT NULL
    GROUP BY 1 ORDER BY n DESC LIMIT 10
  `);
  console.log('top 10 NACE-2 prefixes in kbo_lookup:');
  for (const r of (naceTop.rows ?? naceTop)) console.log(' ', r.nace_2, r.n);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
