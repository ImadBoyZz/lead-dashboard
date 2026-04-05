/**
 * Google Maps scraper CLI script
 *
 * Usage:
 *   npx tsx scripts/scrape-google-maps.ts --query "kapper Aalst"
 *   npx tsx scripts/scrape-google-maps.ts --sector beauty --city Aalst
 *   npx tsx scripts/scrape-google-maps.ts --sector horeca --city Gent --max 30
 */

// ─── Check Playwright dependency ───────────────────────────────────────────

try {
  require.resolve('playwright');
} catch {
  console.error(
    '\x1b[31m[ERROR]\x1b[0m Playwright is not installed.\n' +
    'Run: npm install playwright && npx playwright install chromium\n'
  );
  process.exit(1);
}

// ─── Load env ──────────────────────────────────────────────────────────────

import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and, ilike, sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import * as schema from '../src/lib/db/schema';
import { computePreScore, type PreScoreInput } from '../src/lib/pre-scoring';
import { scrapeGoogleMaps, type MapsScrapedBusiness } from '../src/lib/google-maps-scraper';

// ─── DB setup ──────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\x1b[31m[ERROR]\x1b[0m DATABASE_URL not found in .env.local');
  process.exit(1);
}

const sqlClient = neon(DATABASE_URL);
const db = drizzle(sqlClient, { schema });

// ─── Sector mappings ───────────────────────────────────────────────────────

const SECTOR_SEARCH_TERMS: Record<string, string> = {
  horeca: 'restaurant',
  beauty: 'kapper OR schoonheidssalon',
  auto: 'garage OR autogarage',
  retail: 'bakker OR slager',
  bouw: 'aannemer OR loodgieter OR elektricien',
};

const SECTOR_NACE: Record<string, string> = {
  horeca: '56101',
  beauty: '96021',
  auto: '45201',
  retail: '47111',
  bouw: '43211',
};

// ─── CLI argument parsing ──────────────────────────────────────────────────

function parseArgs(): { query: string; maxResults: number; sector: string | null; city: string | null } {
  const args = process.argv.slice(2);
  let query: string | null = null;
  let sector: string | null = null;
  let city: string | null = null;
  let maxResults = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--query' && args[i + 1]) {
      query = args[++i];
    } else if (args[i] === '--sector' && args[i + 1]) {
      sector = args[++i].toLowerCase();
    } else if (args[i] === '--city' && args[i + 1]) {
      city = args[++i];
    } else if (args[i] === '--max' && args[i + 1]) {
      maxResults = parseInt(args[++i], 10) || 20;
    }
  }

  // Build query from --sector + --city if --query not provided
  if (!query) {
    if (!sector || !city) {
      console.error(
        'Usage:\n' +
        '  npx tsx scripts/scrape-google-maps.ts --query "kapper Aalst"\n' +
        '  npx tsx scripts/scrape-google-maps.ts --sector beauty --city Aalst\n\n' +
        'Available sectors: ' + Object.keys(SECTOR_SEARCH_TERMS).join(', ')
      );
      process.exit(1);
    }
    const searchTerms = SECTOR_SEARCH_TERMS[sector];
    if (!searchTerms) {
      console.error(
        `Unknown sector "${sector}". Available: ${Object.keys(SECTOR_SEARCH_TERMS).join(', ')}`
      );
      process.exit(1);
    }
    query = `${searchTerms} ${city}`;
  }

  return { query, maxResults, sector, city };
}

// ─── Name similarity matching ──────────────────────────────────────────────

function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeForComparison(a);
  const nb = normalizeForComparison(b);

  if (na === nb) return 1.0;

  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Jaccard similarity on words
  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function extractCityFromAddress(address: string | null): string | null {
  if (!address) return null;
  // Try to extract city from address like "Straat 123, 9300 Aalst"
  const match = address.match(/\d{4}\s+([A-Za-zÀ-ÿ\s-]+)/);
  return match ? match[1].trim() : null;
}

// ─── Generate a deterministic registry ID for Maps results ─────────────────

function generateMapsRegistryId(business: MapsScrapedBusiness): string {
  const hash = createHash('md5')
    .update(`${business.name}|${business.address || ''}`)
    .digest('hex')
    .substring(0, 12);
  return `MAPS-${hash}`;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const { query, maxResults, sector, city } = parseArgs();

  console.log(`\n🔍 Scraping Google Maps: "${query}" (max ${maxResults} results)\n`);

  // Step 1: Scrape Google Maps
  const scraped = await scrapeGoogleMaps(query, maxResults);
  console.log(`   Found ${scraped.length} businesses\n`);

  if (scraped.length === 0) {
    console.log('No results found. Exiting.');
    return;
  }

  // Step 2: Process each result
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const biz of scraped) {
    try {
      const scrapedCity = city || extractCityFromAddress(biz.address);

      // Try to find existing candidate by name similarity + city match
      let existingCandidate: typeof schema.kboCandidates.$inferSelect | null = null;

      if (scrapedCity) {
        const candidates = await db
          .select()
          .from(schema.kboCandidates)
          .where(
            ilike(schema.kboCandidates.city, `%${scrapedCity}%`)
          )
          .limit(200);

        for (const candidate of candidates) {
          if (nameSimilarity(candidate.name, biz.name) >= 0.7) {
            existingCandidate = candidate;
            break;
          }
        }
      }

      if (existingCandidate) {
        // Update existing candidate with Google Maps data
        await db
          .update(schema.kboCandidates)
          .set({
            googleRating: biz.rating ?? existingCandidate.googleRating,
            googleReviewCount: biz.reviewCount ?? existingCandidate.googleReviewCount,
            phone: biz.phone ?? existingCandidate.phone,
            website: biz.website ?? existingCandidate.website,
            hasGoogleBusinessProfile: true,
            updatedAt: new Date(),
          })
          .where(eq(schema.kboCandidates.id, existingCandidate.id));

        // Recompute pre-score with enriched data
        const preScoreInput: PreScoreInput = {
          naceCode: existingCandidate.naceCode,
          legalForm: existingCandidate.legalForm,
          website: biz.website ?? existingCandidate.website,
          email: existingCandidate.email,
          phone: biz.phone ?? existingCandidate.phone,
          foundedDate: existingCandidate.foundedDate,
          googleReviewCount: biz.reviewCount ?? existingCandidate.googleReviewCount,
          googleRating: biz.rating ?? existingCandidate.googleRating,
          hasGoogleBusinessProfile: true,
          googleBusinessStatus: existingCandidate.googleBusinessStatus,
        };

        const preScore = computePreScore(preScoreInput);

        await db
          .update(schema.kboCandidates)
          .set({
            preScore: preScore.totalScore,
            scoreBreakdown: preScore.breakdown,
          })
          .where(eq(schema.kboCandidates.id, existingCandidate.id));

        console.log(
          `   ✏️  Updated: ${biz.name} (matched "${existingCandidate.name}", score: ${preScore.totalScore})`
        );
        updated++;
      } else {
        // Insert new candidate
        const registryId = generateMapsRegistryId(biz);
        const naceCode = sector ? SECTOR_NACE[sector] || null : null;

        // Extract postal code from address if possible
        const postalMatch = biz.address?.match(/(\d{4})/);
        const postalCode = postalMatch ? postalMatch[1] : '0000';

        const preScoreInput: PreScoreInput = {
          naceCode,
          legalForm: null,
          website: biz.website,
          email: null,
          phone: biz.phone,
          foundedDate: null,
          googleReviewCount: biz.reviewCount,
          googleRating: biz.rating,
          hasGoogleBusinessProfile: true,
          googleBusinessStatus: null,
        };

        const preScore = computePreScore(preScoreInput);

        // Check if registryId already exists (avoid duplicates across runs)
        const existing = await db
          .select({ id: schema.kboCandidates.id })
          .from(schema.kboCandidates)
          .where(eq(schema.kboCandidates.registryId, registryId))
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        await db.insert(schema.kboCandidates).values({
          registryId,
          name: biz.name,
          naceCode,
          postalCode,
          city: scrapedCity ?? extractCityFromAddress(biz.address),
          street: biz.address,
          website: biz.website,
          phone: biz.phone,
          googleRating: biz.rating,
          googleReviewCount: biz.reviewCount,
          hasGoogleBusinessProfile: true,
          preScore: preScore.totalScore,
          scoreBreakdown: preScore.breakdown,
          status: 'pending',
        });

        console.log(
          `   ➕ Inserted: ${biz.name} (score: ${preScore.totalScore}, ads: ${biz.hasGoogleAds ? 'yes' : 'no'})`
        );
        inserted++;
      }
    } catch (error) {
      console.error(`   ❌ Error processing "${biz.name}":`, error);
      skipped++;
    }
  }

  // Step 3: Print summary
  console.log('\n' + '─'.repeat(50));
  console.log(`\n📊 Summary:`);
  console.log(`   Query:    "${query}"`);
  console.log(`   Scraped:  ${scraped.length} businesses`);
  console.log(`   Inserted: ${inserted} new candidates`);
  console.log(`   Updated:  ${updated} existing candidates`);
  console.log(`   Skipped:  ${skipped} (errors or duplicates)`);

  const withAds = scraped.filter((b) => b.hasGoogleAds).length;
  const withWebsite = scraped.filter((b) => b.website).length;
  const withoutWebsite = scraped.filter((b) => !b.website).length;
  const avgRating = scraped.filter((b) => b.rating).reduce((sum, b) => sum + (b.rating || 0), 0) /
    (scraped.filter((b) => b.rating).length || 1);

  console.log(`\n   Google Ads:      ${withAds} businesses`);
  console.log(`   Has website:     ${withWebsite}`);
  console.log(`   No website:      ${withoutWebsite} (potential leads!)`);
  console.log(`   Avg rating:      ${avgRating.toFixed(1)}`);
  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
