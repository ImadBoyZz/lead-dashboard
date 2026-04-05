import { config } from 'dotenv';
config({ path: '.env.local' });
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { computePreScore } from '../src/lib/pre-scoring';
import { isNaceBlacklisted, isLegalFormAllowed } from '../src/lib/nace-config';

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient, { schema });

// Helpers
function isFlemishPostalCode(postalCode: string): boolean {
  const num = parseInt(postalCode, 10);
  return (num >= 1000 && num <= 1299) || (num >= 1500 && num <= 3999) || (num >= 8000 && num <= 9999);
}

function deriveProvince(postalCode: string): string | null {
  const num = parseInt(postalCode, 10);
  if (num >= 1000 && num <= 1299) return 'Brussel';
  if (num >= 1500 && num <= 1999) return 'Vlaams-Brabant';
  if (num >= 2000 && num <= 2999) return 'Antwerpen';
  if (num >= 3000 && num <= 3499) return 'Vlaams-Brabant';
  if (num >= 3500 && num <= 3999) return 'Limburg';
  if (num >= 8000 && num <= 8999) return 'West-Vlaanderen';
  if (num >= 9000 && num <= 9999) return 'Oost-Vlaanderen';
  return null;
}

function convertDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  // KBO format: DD-MM-YYYY or DD/MM/YYYY
  const sep = dateStr.includes('/') ? '/' : dateStr.includes('-') && dateStr.indexOf('-') <= 2 ? '-' : null;
  if (sep) {
    const [d, m, y] = dateStr.split(sep);
    if (y && m && d) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Already YYYY-MM-DD or unparseable
  return dateStr.length === 10 ? dateStr : null;
}

// Stream a CSV and build a Map via callback (memory efficient — only stores what we need)
function streamCSVToMap<V>(
  filePath: string,
  processRow: (row: Record<string, string>, map: Map<string, V>) => void,
): Promise<Map<string, V>> {
  return new Promise((resolve, reject) => {
    const map = new Map<string, V>();
    createReadStream(filePath)
      .pipe(parse({ columns: true, delimiter: ',', relax_column_count: true, skip_empty_lines: true }))
      .on('data', (row: Record<string, string>) => processRow(row, map))
      .on('end', () => resolve(map))
      .on('error', reject);
  });
}

// Stream enterprises and process one by one
function streamEnterprisesAndProcess(
  filePath: string,
  handler: (row: Record<string, string>) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parser = createReadStream(filePath)
      .pipe(parse({ columns: true, delimiter: ',', relax_column_count: true, skip_empty_lines: true }));

    let pending = 0;
    let ended = false;

    parser.on('data', (row: Record<string, string>) => {
      pending++;
      // Pause stream to control memory
      if (pending > 100) parser.pause();

      handler(row).then(() => {
        pending--;
        if (pending < 50) parser.resume();
        if (ended && pending === 0) resolve();
      }).catch(reject);
    });
    parser.on('end', () => {
      ended = true;
      if (pending === 0) resolve();
    });
    parser.on('error', reject);
  });
}

async function main() {
  const dataDir = process.argv[2] || './kbo-data';
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

  console.log(`Loading lookup maps from ${dataDir}...`);

  // Build lookup maps by streaming (only store what we need)
  const [nameMap, addressMap, contactMap, naceMap] = await Promise.all([
    // Denominations → name map (only NL names, type 001)
    streamCSVToMap<string>(`${dataDir}/denomination.csv`, (row, map) => {
      if (row.Language === '2' && row.TypeOfDenomination === '001') {
        map.set(row.EntityNumber, row.Denomination);
      }
    }),

    // Addresses → address map (only REGO, only Flemish)
    streamCSVToMap<{ zipcode: string; city: string; street: string; houseNumber: string }>(
      `${dataDir}/address.csv`,
      (row, map) => {
        if (row.TypeOfAddress === 'REGO' && row.Zipcode && isFlemishPostalCode(row.Zipcode)) {
          map.set(row.EntityNumber, {
            zipcode: row.Zipcode,
            city: row.MunicipalityNL,
            street: row.StreetNL,
            houseNumber: row.HouseNumber,
          });
        }
      },
    ),

    // Contacts → contact map
    streamCSVToMap<{ email?: string; phone?: string; website?: string }>(
      `${dataDir}/contact.csv`,
      (row, map) => {
        if (!map.has(row.EntityNumber)) {
          map.set(row.EntityNumber, {});
        }
        const entry = map.get(row.EntityNumber)!;
        if (row.ContactType === 'EMAIL') entry.email = row.Value;
        else if (row.ContactType === 'TEL') entry.phone = row.Value;
        else if (row.ContactType === 'WEB') entry.website = row.Value;
      },
    ),

    // Activities → NACE map (only main activity, 2008 version)
    streamCSVToMap<string>(`${dataDir}/activity.csv`, (row, map) => {
      if (row.ActivityGroup === '003' && row.NaceVersion === '2008' && row.Classification === 'MAIN') {
        map.set(row.EntityNumber, row.NaceCode);
      }
    }),
  ]);

  console.log(`Maps loaded: ${nameMap.size} names, ${addressMap.size} addresses, ${contactMap.size} contacts, ${naceMap.size} NACE codes`);
  console.log('Processing enterprises...');

  let processed = 0;
  let skipped = 0;
  let inserted = 0;
  const batchSize = 500;
  let batch: (typeof schema.kboCandidates.$inferInsert)[] = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    try {
      await db
        .insert(schema.kboCandidates)
        .values(batch)
        .onConflictDoUpdate({
          target: schema.kboCandidates.registryId,
          set: {
            enterpriseStatus: sql`EXCLUDED.enterprise_status`,
            name: sql`EXCLUDED.name`,
            naceCode: sql`EXCLUDED.nace_code`,
            legalForm: sql`EXCLUDED.legal_form`,
            website: sql`EXCLUDED.website`,
            email: sql`EXCLUDED.email`,
            phone: sql`EXCLUDED.phone`,
            preScore: sql`EXCLUDED.pre_score`,
            scoreBreakdown: sql`EXCLUDED.score_breakdown`,
            updatedAt: new Date(),
          },
        });
      inserted += batch.length;
    } catch (err) {
      console.error(`\nBatch insert error:`, err);
    }
    batch = [];
    process.stdout.write(`\rProcessed: ${processed}, Inserted: ${inserted}, Skipped: ${skipped}`);
  }

  await streamEnterprisesAndProcess(`${dataDir}/enterprise.csv`, async (row) => {
    if (processed >= limit) return;
    processed++;

    const enterpriseStatus = row.Status ?? 'AC';

    const address = addressMap.get(row.EnterpriseNumber);
    if (!address) { skipped++; return; }

    const naceCode = naceMap.get(row.EnterpriseNumber) ?? null;
    if (isNaceBlacklisted(naceCode)) { skipped++; return; }
    if (!isLegalFormAllowed(row.JuridicalForm)) { skipped++; return; }

    const name = nameMap.get(row.EnterpriseNumber);
    if (!name) { skipped++; return; }

    const contact = contactMap.get(row.EnterpriseNumber) ?? {};
    const province = deriveProvince(address.zipcode);

    const preScoreResult = computePreScore({
      naceCode,
      legalForm: row.JuridicalForm,
      website: contact.website ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      foundedDate: convertDate(row.StartDate),
      googleReviewCount: null,
      googleRating: null,
      hasGoogleBusinessProfile: null,
      googleBusinessStatus: null,
    });

    const registryId = row.EnterpriseNumber.replace(/\./g, '');

    batch.push({
      registryId,
      name,
      legalForm: row.JuridicalForm,
      naceCode,
      foundedDate: convertDate(row.StartDate),
      street: address.street,
      houseNumber: address.houseNumber,
      postalCode: address.zipcode,
      city: address.city,
      province,
      website: contact.website ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      preScore: preScoreResult.totalScore,
      scoreBreakdown: preScoreResult.breakdown,
      enterpriseStatus,
    });

    if (batch.length >= batchSize) {
      await flushBatch();
    }
  });

  // Flush remaining
  await flushBatch();

  console.log(`\nDone! Processed: ${processed}, Inserted: ${inserted}, Skipped: ${skipped}`);
}

main().catch(console.error);
