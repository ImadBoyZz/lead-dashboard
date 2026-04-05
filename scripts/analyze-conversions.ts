import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Empirische herijking — analyseer welke signalen en segmenten correleerden met conversie.
 * Draai na 30-50+ afgeronde leads (won/lost/not_qualified).
 */
async function main() {
  // 1. Overzicht: hoeveel leads per uitkomst?
  const outcomes = await sql`
    SELECT lp.stage, count(*)::int as cnt
    FROM lead_pipeline lp
    WHERE lp.stage IN ('won', 'lost', 'not_qualified')
    GROUP BY lp.stage
    ORDER BY cnt DESC
  `;

  const total = (outcomes as any[]).reduce((sum, r) => sum + r.cnt, 0);
  console.log(`\n=== CONVERSIE ANALYSE (${total} afgeronde leads) ===\n`);

  if (total < 10) {
    console.log('Te weinig data — minimaal 10 afgeronde leads nodig voor analyse.');
    console.log('Huidige verdeling:');
    (outcomes as any[]).forEach(r => console.log(`  ${r.stage}: ${r.cnt}`));
    return;
  }

  console.log('Uitkomsten:');
  (outcomes as any[]).forEach(r =>
    console.log(`  ${r.stage}: ${r.cnt} (${((r.cnt / total) * 100).toFixed(1)}%)`));

  // 2. Win rate per MaturityCluster
  console.log('\n--- Win rate per MaturityCluster ---');
  const clusterStats = await sql`
    SELECT
      ls.maturity_cluster as cluster,
      count(*) FILTER (WHERE lp.stage = 'won')::int as won,
      count(*) FILTER (WHERE lp.stage = 'lost')::int as lost,
      count(*) FILTER (WHERE lp.stage = 'not_qualified')::int as nq,
      count(*)::int as total
    FROM lead_pipeline lp
    JOIN lead_scores ls ON ls.business_id = lp.business_id
    WHERE lp.stage IN ('won', 'lost', 'not_qualified')
    GROUP BY ls.maturity_cluster
    ORDER BY ls.maturity_cluster
  `;
  (clusterStats as any[]).forEach((r) => {
    const winRate = r.total > 0 ? ((r.won / r.total) * 100).toFixed(1) : '0.0';
    console.log(`  Cluster ${r.cluster || '?'}: ${r.won}W / ${r.lost}L / ${r.nq}NQ (${r.total} total, win rate: ${winRate}%)`);
  });

  // 3. Win rate per NACE sector tier
  console.log('\n--- Win rate per sector ---');
  const sectorStats = await sql`
    SELECT
      CASE
        WHEN b.nace_code LIKE '56%' THEN 'Horeca'
        WHEN b.nace_code LIKE '9602%' OR b.nace_code LIKE '9604%' THEN 'Beauty'
        WHEN b.nace_code LIKE '47%' THEN 'Retail'
        WHEN b.nace_code LIKE '45%' THEN 'Auto'
        WHEN b.nace_code LIKE '862%' OR b.nace_code LIKE '869%' THEN 'Medisch'
        WHEN b.nace_code LIKE '41%' OR b.nace_code LIKE '42%' OR b.nace_code LIKE '43%' THEN 'Bouw'
        WHEN b.nace_code LIKE '68%' THEN 'Vastgoed'
        WHEN b.nace_code LIKE '691%' OR b.nace_code LIKE '692%' THEN 'Juridisch/Account'
        ELSE 'Overig'
      END as sector,
      count(*) FILTER (WHERE lp.stage = 'won')::int as won,
      count(*)::int as total
    FROM lead_pipeline lp
    JOIN businesses b ON b.id = lp.business_id
    WHERE lp.stage IN ('won', 'lost', 'not_qualified')
    GROUP BY 1
    HAVING count(*) >= 2
    ORDER BY count(*) FILTER (WHERE lp.stage = 'won')::float / NULLIF(count(*), 0) DESC
  `;
  (sectorStats as any[]).forEach((r) => {
    const winRate = r.total > 0 ? ((r.won / r.total) * 100).toFixed(1) : '0.0';
    console.log(`  ${r.sector}: ${r.won}/${r.total} (win rate: ${winRate}%)`);
  });

  // 4. Rejection reasons verdeling
  console.log('\n--- Rejection reasons ---');
  const rejections = await sql`
    SELECT
      COALESCE(rejection_reason, 'niet_ingevuld') as reason,
      count(*)::int as cnt
    FROM lead_pipeline
    WHERE stage = 'lost'
    GROUP BY 1
    ORDER BY cnt DESC
  `;
  (rejections as any[]).forEach(r => console.log(`  ${r.reason}: ${r.cnt}`));

  // 5. Gemiddelde score bij won vs lost
  console.log('\n--- Score analyse ---');
  const scoreAnalysis = await sql`
    SELECT
      lp.stage,
      round(avg(ls.total_score))::int as avg_score,
      min(ls.total_score)::int as min_score,
      max(ls.total_score)::int as max_score
    FROM lead_pipeline lp
    JOIN lead_scores ls ON ls.business_id = lp.business_id
    WHERE lp.stage IN ('won', 'lost')
    GROUP BY lp.stage
  `;
  (scoreAnalysis as any[]).forEach((r) =>
    console.log(`  ${r.stage}: avg=${r.avg_score} min=${r.min_score} max=${r.max_score}`));

  // 6. Signaal-specifieke win rates
  console.log('\n--- Signaal correlaties ---');

  const signalStats = await sql`
    SELECT
      'Heeft website' as signaal,
      count(*) FILTER (WHERE lp.stage = 'won' AND b.website IS NOT NULL)::int as won_with,
      count(*) FILTER (WHERE b.website IS NOT NULL)::int as total_with,
      count(*) FILTER (WHERE lp.stage = 'won' AND b.website IS NULL)::int as won_without,
      count(*) FILTER (WHERE b.website IS NULL)::int as total_without
    FROM lead_pipeline lp
    JOIN businesses b ON b.id = lp.business_id
    WHERE lp.stage IN ('won', 'lost', 'not_qualified')
    UNION ALL
    SELECT
      'Google reviews > 10' as signaal,
      count(*) FILTER (WHERE lp.stage = 'won' AND b.google_review_count > 10)::int,
      count(*) FILTER (WHERE b.google_review_count > 10)::int,
      count(*) FILTER (WHERE lp.stage = 'won' AND (b.google_review_count IS NULL OR b.google_review_count <= 10))::int,
      count(*) FILTER (WHERE b.google_review_count IS NULL OR b.google_review_count <= 10)::int
    FROM lead_pipeline lp
    JOIN businesses b ON b.id = lp.business_id
    WHERE lp.stage IN ('won', 'lost', 'not_qualified')
    UNION ALL
    SELECT
      'BV/NV rechtsvorm' as signaal,
      count(*) FILTER (WHERE lp.stage = 'won' AND b.legal_form IN ('014', '015'))::int,
      count(*) FILTER (WHERE b.legal_form IN ('014', '015'))::int,
      count(*) FILTER (WHERE lp.stage = 'won' AND b.legal_form NOT IN ('014', '015'))::int,
      count(*) FILTER (WHERE b.legal_form NOT IN ('014', '015'))::int
    FROM lead_pipeline lp
    JOIN businesses b ON b.id = lp.business_id
    WHERE lp.stage IN ('won', 'lost', 'not_qualified')
    UNION ALL
    SELECT
      'Google rating > 4.0' as signaal,
      count(*) FILTER (WHERE lp.stage = 'won' AND b.google_rating > 4.0)::int,
      count(*) FILTER (WHERE b.google_rating > 4.0)::int,
      count(*) FILTER (WHERE lp.stage = 'won' AND (b.google_rating IS NULL OR b.google_rating <= 4.0))::int,
      count(*) FILTER (WHERE b.google_rating IS NULL OR b.google_rating <= 4.0)::int
    FROM lead_pipeline lp
    JOIN businesses b ON b.id = lp.business_id
    WHERE lp.stage IN ('won', 'lost', 'not_qualified')
  `;

  (signalStats as any[]).forEach((r) => {
    const rateWith = r.total_with > 0 ? ((r.won_with / r.total_with) * 100).toFixed(1) : '-';
    const rateWithout = r.total_without > 0 ? ((r.won_without / r.total_without) * 100).toFixed(1) : '-';
    console.log(`  ${r.signaal}:`);
    console.log(`    Met: ${r.won_with}/${r.total_with} (${rateWith}%) | Zonder: ${r.won_without}/${r.total_without} (${rateWithout}%)`);
  });

  // 7. Deal waarde analyse
  console.log('\n--- Deal waarde (gewonnen leads) ---');
  const dealValues = await sql`
    SELECT
      count(*)::int as won_count,
      round(avg(won_value)::numeric, 2) as avg_value,
      round(sum(won_value)::numeric, 2) as total_value,
      round(min(won_value)::numeric, 2) as min_value,
      round(max(won_value)::numeric, 2) as max_value
    FROM lead_pipeline
    WHERE stage = 'won' AND won_value > 0
  `;
  if (dealValues.length > 0 && dealValues[0].won_count > 0) {
    const d = dealValues[0];
    console.log(`  ${d.won_count} deals | Totaal: €${d.total_value} | Gem: €${d.avg_value} | Min: €${d.min_value} | Max: €${d.max_value}`);
  } else {
    console.log('  Nog geen deals met waarde geregistreerd.');
  }

  console.log('\n=== AANBEVELINGEN ===');
  console.log('Draai dit script opnieuw na 30-50 afgeronde leads voor betrouwbare conclusies.');
  console.log('Gebruik de signaal correlaties om scoring-gewichten aan te passen in scoring.ts');
}

main().catch(console.error);
