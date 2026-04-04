/**
 * KBO Bulk Import Script
 *
 * Streams KBO open data CSVs, joins enterprise + denomination + address +
 * contact + activity, filters for Flanders, and POSTs batches to /api/sync.
 *
 * Usage:
 *   npx tsx scripts/kbo-import.ts ./kbo-data
 *   npx tsx scripts/kbo-import.ts ./kbo-data --limit 100
 *   npx tsx scripts/kbo-import.ts ./kbo-data --dry-run
 *   npx tsx scripts/kbo-import.ts ./kbo-data --limit 500 --dry-run
 */

import { createReadStream } from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { config } from 'dotenv';
import { Readable } from 'stream';

// Load .env.local
config({ path: path.resolve(process.cwd(), '.env.local') });

// ── Types ────────────────────────────────────────────────────────────────

interface DenominationEntry {
  name: string;
  languagePriority: number; // lower = better
  typePriority: number; // lower = better
}

interface AddressEntry {
  zipcode: string;
  city: string;
  street: string | null;
  houseNumber: string | null;
  province: string;
}

interface ContactEntry {
  website: string | null;
  email: string | null;
  phone: string | null;
}

interface ActivityEntry {
  naceCode: string;
  naceVersion: string;
}

interface BusinessPayload {
  registryId: string;
  country: 'BE';
  name: string;
  legalForm: string | null;
  naceCode: string | null;
  naceDescription: null;
  foundedDate: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string;
  city: string;
  province: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  dataSource: 'kbo_bulk';
}

// ── Config ───────────────────────────────────────────────────────────────

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.N8N_WEBHOOK_SECRET || 'averis-n8n-secret-change-me';
const BATCH_SIZE = 100;

// ── CLI args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dataDir = args.find((a) => !a.startsWith('--'));
const limitFlag = args.indexOf('--limit');
const LIMIT = limitFlag !== -1 ? parseInt(args[limitFlag + 1], 10) : Infinity;
const DRY_RUN = args.includes('--dry-run');

if (!dataDir) {
  console.error('Usage: npx tsx scripts/kbo-import.ts <kbo-data-dir> [--limit N] [--dry-run]');
  process.exit(1);
}

const resolvedDir = path.resolve(process.cwd(), dataDir);

// ── Helpers ──────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function isFlemishPostalCode(zipcode: string): boolean {
  const z = parseInt(zipcode, 10);
  if (isNaN(z)) return false;
  return (
    (z >= 1500 && z <= 1999) || // Vlaams-Brabant
    (z >= 2000 && z <= 2999) || // Antwerpen
    (z >= 3000 && z <= 3499) || // Vlaams-Brabant (Leuven)
    (z >= 3500 && z <= 3999) || // Limburg
    (z >= 8000 && z <= 8999) || // West-Vlaanderen
    (z >= 9000 && z <= 9999) || // Oost-Vlaanderen
    (z >= 1000 && z <= 1299)    // Brussel (optional)
  );
}

function deriveProvince(zipcode: string): string {
  const z = parseInt(zipcode, 10);
  if (z >= 1000 && z <= 1299) return 'Brussel';
  if (z >= 1500 && z <= 1999) return 'Vlaams-Brabant';
  if (z >= 2000 && z <= 2999) return 'Antwerpen';
  if (z >= 3000 && z <= 3499) return 'Vlaams-Brabant';
  if (z >= 3500 && z <= 3999) return 'Limburg';
  if (z >= 8000 && z <= 8999) return 'West-Vlaanderen';
  if (z >= 9000 && z <= 9999) return 'Oost-Vlaanderen';
  return 'Onbekend';
}

/** Convert dd-mm-yyyy to YYYY-MM-DD */
function convertDate(dateStr: string | undefined): string | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!yyyy || !mm || !dd) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function languagePriority(lang: string): number {
  switch (lang) {
    case '2': return 0; // NL — preferred
    case '4': return 1; // EN
    case '1': return 2; // FR
    case '3': return 3; // DE
    default: return 9;
  }
}

function typePriority(type: string): number {
  switch (type) {
    case '001': return 0; // official
    case '003': return 1; // commercial
    case '002': return 2; // abbreviation
    default: return 9;
  }
}

function createCsvParser() {
  return parse({
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

function streamCsv(filePath: string): Readable {
  return createReadStream(filePath, { encoding: 'utf-8' }).pipe(createCsvParser());
}

// ── Phase 1: Build lookup maps ──────────────────────────────────────────

async function loadDenominations(dir: string): Promise<Map<string, DenominationEntry>> {
  const map = new Map<string, DenominationEntry>();
  const filePath = path.join(dir, 'denomination.csv');
  let count = 0;

  process.stdout.write('Loading denominations...');

  for await (const row of streamCsv(filePath)) {
    count++;
    const entityNumber = row.EntityNumber?.trim();
    const language = row.Language?.trim();
    const typeOfDenom = row.TypeOfDenomination?.trim();
    const denomination = row.Denomination?.trim();

    if (!entityNumber || !denomination) continue;

    const lp = languagePriority(language);
    const tp = typePriority(typeOfDenom);

    const existing = map.get(entityNumber);
    if (
      !existing ||
      lp < existing.languagePriority ||
      (lp === existing.languagePriority && tp < existing.typePriority)
    ) {
      map.set(entityNumber, {
        name: denomination,
        languagePriority: lp,
        typePriority: tp,
      });
    }

    if (count % 500_000 === 0) process.stdout.write(` ${fmt(count)}...`);
  }

  console.log(` ${fmt(count)} rows (${fmt(map.size)} unique entities)`);
  return map;
}

async function loadAddresses(dir: string): Promise<Map<string, AddressEntry>> {
  const map = new Map<string, AddressEntry>();
  const filePath = path.join(dir, 'address.csv');
  let count = 0;
  let flemish = 0;

  process.stdout.write('Loading addresses... filtering Flanders...');

  for await (const row of streamCsv(filePath)) {
    count++;
    const entityNumber = row.EntityNumber?.trim();
    const zipcode = row.Zipcode?.trim();
    const dateStrikingOff = row.DateStrikingOff?.trim();

    if (!entityNumber || !zipcode) continue;
    if (dateStrikingOff) continue; // address was removed
    if (!isFlemishPostalCode(zipcode)) continue;

    flemish++;
    map.set(entityNumber, {
      zipcode,
      city: row.MunicipalityNL?.trim() || row.MunicipalityFR?.trim() || '',
      street: row.StreetNL?.trim() || row.StreetFR?.trim() || null,
      houseNumber: row.HouseNumber?.trim() || null,
      province: deriveProvince(zipcode),
    });

    if (count % 500_000 === 0) process.stdout.write(` ${fmt(count)}...`);
  }

  console.log(` ${fmt(count)} rows, ${fmt(flemish)} Flemish addresses`);
  return map;
}

async function loadContacts(dir: string): Promise<Map<string, ContactEntry>> {
  const map = new Map<string, ContactEntry>();
  const filePath = path.join(dir, 'contact.csv');
  let count = 0;

  process.stdout.write('Loading contacts...');

  for await (const row of streamCsv(filePath)) {
    count++;
    const entityNumber = row.EntityNumber?.trim();
    const contactType = row.ContactType?.trim();
    const value = row.Value?.trim();

    if (!entityNumber || !contactType || !value) continue;

    const existing = map.get(entityNumber) || { website: null, email: null, phone: null };

    switch (contactType) {
      case 'WEB':
        if (!existing.website) existing.website = value;
        break;
      case 'EMAIL':
        if (!existing.email) existing.email = value;
        break;
      case 'TEL':
      case 'GSM':
        if (!existing.phone) existing.phone = value;
        break;
    }

    map.set(entityNumber, existing);

    if (count % 500_000 === 0) process.stdout.write(` ${fmt(count)}...`);
  }

  console.log(` ${fmt(count)} rows (${fmt(map.size)} unique entities)`);
  return map;
}

async function loadActivities(dir: string): Promise<Map<string, ActivityEntry>> {
  const map = new Map<string, ActivityEntry>();
  const filePath = path.join(dir, 'activity.csv');
  let count = 0;

  process.stdout.write('Loading activities...');

  for await (const row of streamCsv(filePath)) {
    count++;
    const entityNumber = row.EntityNumber?.trim();
    const naceVersion = row.NaceVersion?.trim();
    const naceCode = row.NaceCode?.trim();
    const classification = row.Classification?.trim();

    if (!entityNumber || !naceCode) continue;
    if (naceVersion !== '2008') continue;
    if (classification !== 'MAIN') continue;

    // Take first 4 digits
    const code = naceCode.replace(/\./g, '').substring(0, 4);

    if (!map.has(entityNumber)) {
      map.set(entityNumber, { naceCode: code, naceVersion });
    }

    if (count % 2_000_000 === 0) process.stdout.write(` ${fmt(count)}...`);
  }

  console.log(` ${fmt(count)} rows (${fmt(map.size)} unique entities)`);
  return map;
}

// ── Phase 2 & 3: Stream enterprises, join data, batch POST ──────────────

async function postBatch(businesses: BusinessPayload[], batchNum: number): Promise<{ inserted: number; updated: number }> {
  const url = `${API_URL}/api/sync`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify({ businesses }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Batch ${batchNum} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as { inserted: number; updated: number };
}

async function processEnterprises(
  dir: string,
  denominations: Map<string, DenominationEntry>,
  addresses: Map<string, AddressEntry>,
  contacts: Map<string, ContactEntry>,
  activities: Map<string, ActivityEntry>,
): Promise<void> {
  const filePath = path.join(dir, 'enterprise.csv');
  const estimatedTotal = addresses.size;

  let processed = 0;
  let sent = 0;
  let skippedNoAddress = 0;
  let skippedNoName = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let errors = 0;
  let batch: BusinessPayload[] = [];
  let batchNum = 0;

  console.log(`\nProcessing enterprises... (estimated ~${fmt(estimatedTotal)} Flemish)`);
  if (DRY_RUN) console.log('[DRY RUN] No data will be sent to the API.\n');
  if (LIMIT < Infinity) console.log(`[LIMIT] Processing max ${fmt(LIMIT)} businesses.\n`);

  for await (const row of streamCsv(filePath)) {
    if (sent >= LIMIT) break;

    const enterpriseNumber = row.EnterpriseNumber?.trim();
    if (!enterpriseNumber) continue;

    // Must have a Flemish address
    const address = addresses.get(enterpriseNumber);
    if (!address) {
      skippedNoAddress++;
      continue;
    }

    // Must have a name
    const denomination = denominations.get(enterpriseNumber);
    if (!denomination) {
      skippedNoName++;
      continue;
    }

    const contact = contacts.get(enterpriseNumber);
    const activity = activities.get(enterpriseNumber);

    const payload: BusinessPayload = {
      registryId: enterpriseNumber,
      country: 'BE',
      name: denomination.name,
      legalForm: row.JuridicalForm?.trim() || null,
      naceCode: activity?.naceCode || null,
      naceDescription: null,
      foundedDate: convertDate(row.StartDate),
      street: address.street,
      houseNumber: address.houseNumber,
      postalCode: address.zipcode,
      city: address.city,
      province: address.province,
      website: contact?.website || null,
      email: contact?.email || null,
      phone: contact?.phone || null,
      dataSource: 'kbo_bulk',
    };

    batch.push(payload);
    sent++;

    if (batch.length >= BATCH_SIZE) {
      batchNum++;
      processed += batch.length;

      if (DRY_RUN) {
        if (processed % 1000 === 0 || sent >= LIMIT) {
          console.log(`[${fmt(processed)}/${fmt(Math.min(estimatedTotal, LIMIT))}] Would send batch ${batchNum} (${batch.length} businesses)`);
        }
      } else {
        try {
          const result = await postBatch(batch, batchNum);
          totalInserted += result.inserted;
          totalUpdated += result.updated;

          if (processed % 1000 === 0 || sent >= LIMIT) {
            console.log(
              `[${fmt(processed)}/${fmt(Math.min(estimatedTotal, LIMIT))}] Sent batch ${batchNum} (${batch.length} businesses) - ${result.inserted} inserted, ${result.updated} updated`,
            );
          }
        } catch (err) {
          errors++;
          console.error(`Error in batch ${batchNum}:`, err instanceof Error ? err.message : err);
        }
      }

      batch = [];
    }
  }

  // Send remaining batch
  if (batch.length > 0) {
    batchNum++;
    processed += batch.length;

    if (DRY_RUN) {
      console.log(`[${fmt(processed)}/${fmt(Math.min(estimatedTotal, LIMIT))}] Would send batch ${batchNum} (${batch.length} businesses)`);
    } else {
      try {
        const result = await postBatch(batch, batchNum);
        totalInserted += result.inserted;
        totalUpdated += result.updated;
        console.log(
          `[${fmt(processed)}/${fmt(Math.min(estimatedTotal, LIMIT))}] Sent batch ${batchNum} (${batch.length} businesses) - ${result.inserted} inserted, ${result.updated} updated`,
        );
      } catch (err) {
        errors++;
        console.error(`Error in batch ${batchNum}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Summary
  console.log('\n════════════════════════════════════════');
  console.log(DRY_RUN ? '  DRY RUN COMPLETE' : '  IMPORT COMPLETE');
  console.log('════════════════════════════════════════');
  console.log(`  Total matched:          ${fmt(sent)}`);
  console.log(`  Total batches:          ${fmt(batchNum)}`);
  if (!DRY_RUN) {
    console.log(`  Inserted:               ${fmt(totalInserted)}`);
    console.log(`  Updated:                ${fmt(totalUpdated)}`);
  }
  console.log(`  Skipped (no name):      ${fmt(skippedNoName)}`);
  console.log(`  Skipped (no FL addr):   ${fmt(skippedNoAddress)}`);
  console.log(`  Errors:                 ${fmt(errors)}`);
  console.log('════════════════════════════════════════\n');
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     KBO Bulk Import → Lead Dashboard ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  Data dir:   ${resolvedDir}`);
  console.log(`  API:        ${API_URL}`);
  console.log(`  Dry run:    ${DRY_RUN}`);
  console.log(`  Limit:      ${LIMIT === Infinity ? 'none' : fmt(LIMIT)}`);
  console.log('');

  const start = Date.now();

  // Phase 1: Build lookup maps
  const denominations = await loadDenominations(resolvedDir);
  const addresses = await loadAddresses(resolvedDir);
  const contacts = await loadContacts(resolvedDir);
  const activities = await loadActivities(resolvedDir);

  const mapTime = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nLookup maps built in ${mapTime}s`);
  console.log(`  Memory: ~${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0)} MB\n`);

  // Phase 2 & 3: Stream enterprises, join, batch POST
  await processEnterprises(resolvedDir, denominations, addresses, contacts, activities);

  const totalTime = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Total time: ${totalTime}s`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
