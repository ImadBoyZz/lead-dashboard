import { config } from 'dotenv';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

config({ path: path.resolve(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);

(async () => {
  console.log('── batch_runs vandaag ──');
  const runs = await sql`
    SELECT job_type, status, input_count, output_count,
           TO_CHAR(started_at, 'HH24:MI:SS') AS tijd,
           metadata->>'reason' AS reason
    FROM batch_runs
    WHERE run_date = CURRENT_DATE
    ORDER BY started_at DESC
  `;
  if (runs.length === 0) console.log('  (nog geen)');
  for (const r of runs) {
    console.log(`  ${r.tijd}  ${r.job_type.padEnd(22)} ${r.status.padEnd(8)} in=${r.input_count ?? '-'} out=${r.output_count ?? '-'}${r.reason ? ` (${r.reason})` : ''}`);
  }

  console.log('\n── Lead counts nu ──');
  const counts = await sql`
    SELECT
      COUNT(*) FILTER (WHERE lead_temperature = 'cold' AND opt_out = false AND blacklisted = false) AS cold,
      COUNT(*) FILTER (WHERE lead_temperature = 'warm' AND opt_out = false AND blacklisted = false) AS warm,
      COUNT(*) FILTER (WHERE auto_promoted_at IS NOT NULL) AS auto_promoted_total
    FROM businesses
  `;
  console.log(`  cold:                ${counts[0].cold}`);
  console.log(`  warm:                ${counts[0].warm}`);
  console.log(`  auto-gepromoot ooit: ${counts[0].auto_promoted_total}`);

  console.log('\n── Leads die nog op enrichment wachten ──');
  const pending = await sql`
    SELECT COUNT(*) AS n
    FROM businesses b
    WHERE b.country = 'BE'
      AND b.opt_out = false AND b.blacklisted = false
      AND (b.chain_classified_at IS NULL OR b.website_verdict_at IS NULL OR b.email_status = 'unverified')
      AND NOT EXISTS (SELECT 1 FROM outreach_log WHERE business_id = b.id AND contacted_at >= NOW() - INTERVAL '90 days')
  `;
  console.log(`  Queue voor morning qualification: ${pending[0].n}`);
})();
