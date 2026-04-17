// Meet KBO exact-match recall op bestaande Places-leads.
// Plan: ik-heb-eigenlijk-een-merry-oasis.md §Chunk 2.
//
// Output:
//   - Per-lead resultaat (match/niet-match + confidence + KBO velden)
//   - Aggregate: match-rate, verdeling juridicalForm, naceCode coverage
//   - BESLISPUNT: als recall ≥ 60% → door naar Chunk 3. Als < 60% → voeg fuzzy toe.
//
// Gebruik:
//   npx tsx scripts/measure-kbo-match-rate.ts             (50 random leads)
//   npx tsx scripts/measure-kbo-match-rate.ts --n 100     (100 leads)
//   npx tsx scripts/measure-kbo-match-rate.ts --verbose   (print alle leads)

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { sql as dsql } from 'drizzle-orm';

const args = process.argv.slice(2);
const nIdx = args.indexOf('--n');
const N = nIdx !== -1 ? parseInt(args[nIdx + 1], 10) : 50;
const VERBOSE = args.includes('--verbose');

async function main() {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { matchKboEnterprise } = await import('../src/lib/kbo/matcher');
  const { extractPostcodeFromAddress } = await import('../src/lib/kbo/normalize');

  console.log(`\n=== KBO Exact-Match Recall — ${N} random Places-leads ===\n`);

  // Random selectie van Places-leads die nog geen KBO-match hebben
  const leads = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      postalCode: schema.businesses.postalCode,
      street: schema.businesses.street,
      city: schema.businesses.city,
      foundedDate: schema.businesses.foundedDate,
      naceCode: schema.businesses.naceCode,
      legalForm: schema.businesses.legalForm,
      dataSource: schema.businesses.dataSource,
    })
    .from(schema.businesses)
    .where(dsql`${schema.businesses.kboMatchedAt} IS NULL`)
    .orderBy(dsql`random()`)
    .limit(N);

  if (leads.length === 0) {
    console.log('Geen leads gevonden om te testen.');
    return;
  }

  let matched = 0;
  let foundedDateFilled = 0;
  let naceFilled = 0;
  let legalFormFilled = 0;
  const juridicalForms: Record<string, number> = {};
  const nacePrefixes: Record<string, number> = {};
  const unmatchedSamples: Array<{ name: string; postalCode: string | null }> = [];

  for (const [i, lead] of leads.entries()) {
    // Postcode kan in lead.postalCode zitten of in lead.street (Places stopt het full address daar)
    const postcode = lead.postalCode ?? extractPostcodeFromAddress(lead.street);
    const result = await matchKboEnterprise({
      name: lead.name,
      postalCode: postcode,
    });

    if (result) {
      matched++;
      if (result.foundedDate) foundedDateFilled++;
      if (result.naceCode) naceFilled++;
      if (result.legalForm) legalFormFilled++;
      if (result.legalForm) juridicalForms[result.legalForm] = (juridicalForms[result.legalForm] || 0) + 1;
      if (result.naceCode) {
        const prefix = result.naceCode.slice(0, 2);
        nacePrefixes[prefix] = (nacePrefixes[prefix] || 0) + 1;
      }
    } else if (unmatchedSamples.length < 10) {
      unmatchedSamples.push({ name: lead.name, postalCode: lead.postalCode });
    }

    if (VERBOSE) {
      const status = result ? '✓' : '✗';
      const details = result
        ? `KBO=${result.enterpriseNumber} conf=${result.confidence.toFixed(2)} nace=${result.naceCode ?? '-'} founded=${result.foundedDate ?? '-'} legal=${result.legalForm ?? '-'}`
        : 'no match';
      console.log(`  ${status} [${String(i + 1).padStart(2)}] ${lead.name.padEnd(40)} ${postcode ?? '----'} ${lead.city?.padEnd(20) ?? ''} → ${details}`);
    }
  }

  const pct = (n: number) => ((n / leads.length) * 100).toFixed(1);

  console.log(`\n─── Resultaten op ${leads.length} leads ───`);
  console.log(`  Matched:              ${matched}/${leads.length}  (${pct(matched)}%)`);
  if (matched > 0) {
    console.log(`  foundedDate gevuld:   ${foundedDateFilled}/${matched}  (${((foundedDateFilled / matched) * 100).toFixed(1)}%)`);
    console.log(`  naceCode gevuld:      ${naceFilled}/${matched}  (${((naceFilled / matched) * 100).toFixed(1)}%)`);
    console.log(`  legalForm gevuld:     ${legalFormFilled}/${matched}  (${((legalFormFilled / matched) * 100).toFixed(1)}%)`);
  }

  if (Object.keys(juridicalForms).length > 0) {
    const top = Object.entries(juridicalForms).sort(([, a], [, b]) => b - a).slice(0, 5);
    console.log(`\n  Top rechtsvormen:`);
    for (const [form, count] of top) console.log(`    ${form.padEnd(6)} ${count}`);
  }

  if (Object.keys(nacePrefixes).length > 0) {
    const top = Object.entries(nacePrefixes).sort(([, a], [, b]) => b - a).slice(0, 10);
    console.log(`\n  Top NACE-prefixen (2-digit):`);
    for (const [prefix, count] of top) console.log(`    ${prefix}   ${count}`);
  }

  if (unmatchedSamples.length > 0) {
    console.log(`\n  Niet-matchende leads (eerste ${unmatchedSamples.length}):`);
    for (const u of unmatchedSamples) console.log(`    - ${u.name}  [${u.postalCode ?? '----'}]`);
  }

  console.log(`\n─── BESLISPUNT ───`);
  const rate = matched / leads.length;
  if (rate >= 0.6) {
    console.log(`  ✓ Recall ${(rate * 100).toFixed(1)}% ≥ 60% — door naar Chunk 3 (exact match volstaat)`);
  } else if (rate >= 0.4) {
    console.log(`  ⚠ Recall ${(rate * 100).toFixed(1)}% tussen 40-60% — voeg pg_trgm fuzzy (≥0.85) toe in matcher.ts`);
  } else {
    console.log(`  ✗ Recall ${(rate * 100).toFixed(1)}% < 40% — onderzoek eerst waarom: normalisatie issues, postcodes, Places vs KBO naam-discrepanties`);
  }
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
