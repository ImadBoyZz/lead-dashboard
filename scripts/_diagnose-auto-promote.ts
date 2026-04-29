// Diagnose waarom auto-promote weinig candidates heeft.
// Laat zien: distributie van website_verdict, email_status, en completion-staat van enrichment.

import { config } from 'dotenv';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

config({ path: path.resolve(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const poolSize = await sql`
    SELECT COUNT(*) AS n FROM businesses WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false
  `;
  console.log(`Cold pool (excl. opt-out/blacklist): ${poolSize[0].n}`);

  console.log('\n── website_verdict distributie ──');
  const wv = await sql`
    SELECT COALESCE(website_verdict::text, '(null)') AS verdict, COUNT(*) AS n
    FROM businesses WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false
    GROUP BY website_verdict ORDER BY n DESC
  `;
  for (const r of wv) console.log(`  ${r.verdict.padEnd(12)} → ${r.n}`);

  console.log('\n── email_status distributie ──');
  const es = await sql`
    SELECT COALESCE(email_status::text, '(null)') AS status, COUNT(*) AS n
    FROM businesses WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false
    GROUP BY email_status ORDER BY n DESC
  `;
  for (const r of es) console.log(`  ${r.status.padEnd(14)} → ${r.n}`);

  console.log('\n── chain_classification distributie ──');
  const cc = await sql`
    SELECT COALESCE(chain_classification::text, '(null)') AS c, COUNT(*) AS n
    FROM businesses WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false
    GROUP BY chain_classification ORDER BY n DESC
  `;
  for (const r of cc) console.log(`  ${r.c.padEnd(14)} → ${r.n}`);

  console.log('\n── Enrichment compleet-status ──');
  const completion = await sql`
    SELECT
      COUNT(*) FILTER (WHERE chain_classified_at IS NOT NULL) AS qualify_done,
      COUNT(*) FILTER (WHERE website_verdict_at IS NOT NULL) AS website_done,
      COUNT(*) FILTER (WHERE email_status IS NOT NULL AND email_status != 'unverified') AS email_done,
      COUNT(*) FILTER (WHERE chain_classified_at IS NOT NULL AND website_verdict_at IS NOT NULL AND email_status IS NOT NULL AND email_status != 'unverified') AS all_done
    FROM businesses WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false
  `;
  console.log(`  qualify voltooid:  ${completion[0].qualify_done}`);
  console.log(`  website voltooid:  ${completion[0].website_done}`);
  console.log(`  email voltooid:    ${completion[0].email_done}`);
  console.log(`  ALLE 3 voltooid:   ${completion[0].all_done}`);

  console.log('\n── Van de "ALLE 3 voltooid" leads, welke criteria matchen niet? ──');
  const whyNot = await sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE website_verdict IN ('none','outdated','parked')) AS website_ok,
      COUNT(*) FILTER (WHERE email_status IN ('mx_valid','smtp_valid')) AS email_ok,
      COUNT(*) FILTER (WHERE chain_classification IS NULL OR chain_classification IN ('independent','unknown')) AS chain_ok,
      COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM lead_scores ls WHERE ls.business_id = b.id AND ls.disqualified = true)) AS not_disqualified
    FROM businesses b
    WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false
      AND chain_classified_at IS NOT NULL AND website_verdict_at IS NOT NULL
      AND email_status IS NOT NULL AND email_status != 'unverified'
  `;
  console.log(`  Van ${whyNot[0].total} volledig geënrichte cold leads:`);
  console.log(`    website OK:        ${whyNot[0].website_ok}`);
  console.log(`    email OK:          ${whyNot[0].email_ok}`);
  console.log(`    chain OK:          ${whyNot[0].chain_ok}`);
  console.log(`    niet-disqualif.:   ${whyNot[0].not_disqualified}`);
})();
