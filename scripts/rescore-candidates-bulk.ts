import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { computePreScore } from '../src/lib/pre-scoring';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Bulk rescore kboCandidates using raw SQL.
 * Fetches in batches, computes scores in JS, then does bulk UPDATE with CASE statements.
 */
async function main() {
  const [{ count }] = await sql`SELECT count(*)::int as count FROM kbo_candidates`;
  console.log(`Found ${count} candidates to rescore.`);

  const FETCH_SIZE = 5000;
  const UPDATE_CHUNK = 500; // rows per UPDATE statement
  let offset = 0;
  let totalUpdated = 0;

  while (offset < count) {
    // Fetch batch with only needed columns
    const batch = await sql`
      SELECT id, nace_code, legal_form, website, email, phone, founded_date,
             google_review_count, google_rating, has_google_business_profile, google_business_status
      FROM kbo_candidates
      ORDER BY id
      LIMIT ${FETCH_SIZE} OFFSET ${offset}
    `;

    if (batch.length === 0) break;

    // Compute scores in JS
    const scored = batch.map(row => {
      const result = computePreScore({
        naceCode: row.nace_code,
        legalForm: row.legal_form,
        website: row.website,
        email: row.email,
        phone: row.phone,
        foundedDate: row.founded_date,
        googleReviewCount: row.google_review_count,
        googleRating: row.google_rating,
        hasGoogleBusinessProfile: row.has_google_business_profile,
        googleBusinessStatus: row.google_business_status,
      });
      return { id: row.id, score: result.totalScore, breakdown: JSON.stringify(result.breakdown) };
    });

    // Build bulk update in chunks
    for (let i = 0; i < scored.length; i += UPDATE_CHUNK) {
      const chunk = scored.slice(i, i + UPDATE_CHUNK);

      // Build VALUES list for UPDATE FROM pattern
      const valuesList = chunk.map(s =>
        `('${s.id}'::uuid, ${s.score}, '${s.breakdown.replace(/'/g, "''")}'::jsonb)`
      ).join(',\n');

      await sql.query(`
        UPDATE kbo_candidates AS c SET
          pre_score = v.score,
          score_breakdown = v.breakdown,
          updated_at = NOW()
        FROM (VALUES ${valuesList}) AS v(id, score, breakdown)
        WHERE c.id = v.id
      `);

      totalUpdated += chunk.length;
      process.stdout.write(`\rRescored: ${totalUpdated}/${count}`);
    }

    offset += FETCH_SIZE;
  }

  console.log(`\nDone! Rescored ${totalUpdated} candidates.`);

  // Show top 20 after rescore
  const top = await sql`
    SELECT name, nace_code, legal_form, website, email, phone, founded_date, pre_score
    FROM kbo_candidates
    ORDER BY pre_score DESC
    LIMIT 20
  `;

  console.log('\n=== TOP 20 CANDIDATES (nieuwe pre-score) ===');
  top.forEach((r: Record<string, unknown>, i: number) => {
    console.log(`${String(i + 1).padStart(2)}. Score: ${String(r.pre_score).padStart(2)} | ${r.name}`);
    console.log(`    NACE: ${r.nace_code || '-'} | Form: ${r.legal_form || '-'} | Website: ${r.website ? 'Ja' : 'Nee'} | Email: ${r.email ? 'Ja' : 'Nee'} | Tel: ${r.phone ? 'Ja' : 'Nee'} | Founded: ${r.founded_date || '-'}`);
  });

  // Score distribution
  const dist = await sql`
    SELECT
      CASE
        WHEN pre_score >= 50 THEN 'Hot (50+)'
        WHEN pre_score >= 30 THEN 'Warm (30-49)'
        WHEN pre_score > 0 THEN 'Koud (1-29)'
        ELSE 'Excluded (0)'
      END as category,
      count(*)::int as cnt
    FROM kbo_candidates
    GROUP BY 1
    ORDER BY 1
  `;
  console.log('\n=== SCORE VERDELING ===');
  dist.forEach((r: Record<string, unknown>) => console.log(`${r.category}: ${r.cnt}`));
}

main().catch(console.error);
