// Dry-run: telt hoeveel bestaande leads NU auto-promoot zouden worden
// zonder feitelijk te updaten. Gebruik dit om te verifiëren dat de
// criteria zinvol zijn vóór je de enrich-pijplijn over bestaande data laat lopen.

import { config } from 'dotenv';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

config({ path: path.resolve(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);

(async () => {
  const eligible = await sql`
    SELECT COUNT(*) AS n
    FROM businesses b
    WHERE b.lead_temperature = 'cold'
      AND b.auto_promoted_at IS NULL
      AND b.opt_out = false
      AND b.blacklisted = false
      AND b.website_verdict IN ('none', 'outdated', 'parked')
      AND b.email_status IN ('mx_valid', 'smtp_valid')
      AND (b.chain_classification IS NULL OR b.chain_classification IN ('independent', 'unknown'))
      AND (b.google_business_status IS NULL OR b.google_business_status != 'CLOSED_PERMANENTLY')
      AND NOT EXISTS (
        SELECT 1 FROM lead_scores ls
        WHERE ls.business_id = b.id AND ls.disqualified = true
      )
  `;

  const alreadyWarm = await sql`
    SELECT COUNT(*) AS n FROM businesses WHERE lead_temperature = 'warm'
  `;

  const totalCold = await sql`
    SELECT COUNT(*) AS n FROM businesses WHERE lead_temperature = 'cold'
  `;

  const breakdown = await sql`
    SELECT
      COUNT(*) FILTER (WHERE website_verdict IN ('none', 'outdated', 'parked')) AS website_ok,
      COUNT(*) FILTER (WHERE email_status IN ('mx_valid', 'smtp_valid')) AS email_ok,
      COUNT(*) FILTER (WHERE chain_classification IS NULL OR chain_classification IN ('independent', 'unknown')) AS chain_ok,
      COUNT(*) FILTER (WHERE google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY') AS activity_ok
    FROM businesses
    WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false
  `;

  console.log('── Huidige state ──');
  console.log(`  Total cold:        ${totalCold[0].n}`);
  console.log(`  Total warm (nu):   ${alreadyWarm[0].n}`);
  console.log('');
  console.log('── Per-criterium (van cold pool excl. opt-out/blacklist) ──');
  console.log(`  website_verdict OK: ${breakdown[0].website_ok}`);
  console.log(`  email_status OK:    ${breakdown[0].email_ok}`);
  console.log(`  chain_class OK:     ${breakdown[0].chain_ok}`);
  console.log(`  google_status OK:   ${breakdown[0].activity_ok}`);
  console.log('');
  console.log('── Zou NU auto-promoot worden ──');
  console.log(`  Eligible leads: ${eligible[0].n}`);
  console.log('');
  console.log('Geen DB-wijziging gedaan. Dit is een read-only telling.');
})();
