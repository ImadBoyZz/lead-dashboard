import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  const ready: any = await db.execute(sql`
    SELECT b.id, b.name, b.website, b.website_verdict, b.email, b.email_status
    FROM businesses b
    WHERE b.lead_temperature = 'cold'
      AND b.opt_out = false AND b.blacklisted = false
      AND b.email_status IN ('mx_valid', 'smtp_valid')
      AND b.website_verdict IN ('outdated', 'none', 'parked')
      AND (b.chain_classification IS NULL OR b.chain_classification IN ('independent', 'unknown'))
      AND NOT EXISTS (
        SELECT 1 FROM lead_scores
        WHERE lead_scores.business_id = b.id AND lead_scores.disqualified = true
      )
  `);
  const rows = ready.rows ?? ready;
  console.log(`Cold leads klaar voor auto-promote (verdict OK + email OK): ${rows.length}`);
  for (const r of rows) console.log(`  ${r.name.padEnd(30)} verdict=${r.website_verdict} email=${r.email}`);

  const noEmail: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM businesses
    WHERE lead_temperature = 'cold' AND blacklisted = false AND opt_out = false
      AND website_verdict IN ('outdated', 'none', 'parked')
      AND email_status NOT IN ('mx_valid', 'smtp_valid')
  `);
  console.log(`\nCold + outdated maar email NIET valid: ${(noEmail.rows ?? noEmail)[0].n}`);
  console.log('  → email finder moet draaien voor deze');

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
