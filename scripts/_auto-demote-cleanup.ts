import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  // Toon wie gedemoot wordt
  const before: any = await db.execute(sql`
    SELECT id, name, website_verdict
    FROM businesses
    WHERE lead_temperature = 'warm'
      AND auto_promoted_at IS NOT NULL
      AND website_verdict NOT IN ('none', 'outdated', 'parked')
  `);
  const rows = before.rows ?? before;
  console.log(`Demote ${rows.length} leads (verdict niet meer kwalificeert):`);
  for (const r of rows) console.log(`  ${r.id.slice(0,8)} ${r.name} verdict=${r.website_verdict}`);

  await db.execute(sql`
    UPDATE businesses
    SET lead_temperature = 'cold',
        auto_promoted_at = NULL,
        updated_at = NOW()
    WHERE lead_temperature = 'warm'
      AND auto_promoted_at IS NOT NULL
      AND website_verdict NOT IN ('none', 'outdated', 'parked')
  `);
  console.log(`\n✓ ${rows.length} leads → cold`);

  // Final state
  const after: any = await db.execute(sql`
    SELECT name, website, website_verdict
    FROM businesses
    WHERE lead_temperature = 'warm' AND auto_promoted_at::date = CURRENT_DATE
    ORDER BY name
  `);
  console.log(`\n=== Warm leads over (${(after.rows ?? after).length}): ===`);
  for (const r of (after.rows ?? after))
    console.log(`  ${r.name} (${r.website_verdict}) ${r.website}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
