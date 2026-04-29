import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const { findContactEmail } = await import('../src/lib/enrich/email-finder');

  const r: any = await db.execute(sql`
    SELECT id, name, website FROM businesses
    WHERE lead_temperature = 'cold' AND blacklisted = false
      AND website_verdict IN ('outdated', 'none')
      AND email_status NOT IN ('mx_valid', 'smtp_valid')
      AND website IS NOT NULL
    ORDER BY name
  `);
  const leads = r.rows ?? r;
  console.log(`Testing ${leads.length} leads via direct email-finder\n`);

  let found = 0;
  for (const lead of leads) {
    const t = Date.now();
    const result = await findContactEmail({ website: lead.website, businessName: lead.name });
    const ms = Date.now() - t;
    const tag = result.email && result.mxValid ? '✓' : result.email ? '?' : '✗';
    console.log(`${tag} ${lead.name.padEnd(30)} ${result.email ?? '(geen)'} mx=${result.mxValid} (${ms}ms, paths=${result.scrapedPaths.length})`);
    if (result.email && result.mxValid) {
      found++;
      // Persist into DB
      await db.execute(sql`
        UPDATE businesses
        SET email = ${result.email}, email_source = 'firecrawl', email_status = 'mx_valid',
            email_status_updated_at = NOW(), updated_at = NOW()
        WHERE id = ${lead.id}::uuid
      `);
    }
  }
  console.log(`\nGevonden + MX-valid: ${found}/${leads.length}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
