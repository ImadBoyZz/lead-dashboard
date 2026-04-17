/**
 * KBO Lookup Import (v4 — consolidated)
 *
 * Leest 4 KBO CSV's, joint in-memory, schrijft naar ÉÉN kbo_lookup tabel.
 * Past binnen Neon 512MB free tier. Plan: §Quota fix.
 *
 * Gebruik:
 *   npx tsx scripts/kbo-import.ts ./kbo-data
 *   npx tsx scripts/kbo-import.ts ./kbo-data --limit 10000
 *   npx tsx scripts/kbo-import.ts ./kbo-data --truncate   (eerst TRUNCATE voor refresh)
 *   npx tsx scripts/kbo-import.ts ./kbo-data --all-be     (héél België — vereist betaald plan)
 *
 * Volgorde (alles streaming om RAM binnen redelijk te houden):
 *   Pass 1: address.csv → Map(entity_number → {zipcode, municipality, province})
 *           Filter: Vlaanderen/Brussel postcodes + actief adres
 *   Pass 2: denomination.csv → Map(entity_number → {normalized_name, denomination})
 *           Filter: TypeOfDenomination=001 (officieel), alleen entities in scope
 *   Pass 3: activity.csv → Map(entity_number → {nace_code, nace_version})
 *           Filter: Classification=MAIN, alleen entities in scope
 *   Pass 4: enterprise.csv → joint in-memory → batch INSERT naar kbo_lookup
 *           Filter: Status=AC, TypeOfEnterprise in {1,2}, entity in alle 3 voorgaande maps
 */

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.local') });

import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import { neon } from '@neondatabase/serverless';
import { normalizeBusinessName, normalizePostcode } from '../src/lib/kbo/normalize';

const args = process.argv.slice(2);
const dataDir = args.find((a) => !a.startsWith('--'));
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const TRUNCATE = args.includes('--truncate');
const ALL_BE = args.includes('--all-be');

if (!dataDir) {
  console.error('Usage: npx tsx scripts/kbo-import.ts <kbo-data-dir> [--limit N] [--truncate] [--all-be]');
  process.exit(1);
}

const resolvedDir = path.resolve(process.cwd(), dataDir);
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL ontbreekt in .env.local');
  process.exit(1);
}

const BATCH_SIZE = 1000;
const sql = neon(DATABASE_URL);

function fmt(n: number): string {
  return n.toLocaleString('nl-BE');
}

function isFlemishOrBrussels(zipcode: string): boolean {
  const z = parseInt(zipcode, 10);
  if (isNaN(z)) return false;
  return (
    (z >= 1000 && z <= 1299) ||
    (z >= 1500 && z <= 3999) ||
    (z >= 8000 && z <= 9999)
  );
}

function deriveProvince(zipcode: string): string {
  const z = parseInt(zipcode, 10);
  if (isNaN(z)) return '';
  if (z >= 1000 && z <= 1299) return 'Brussel';
  if (z >= 1500 && z <= 1999) return 'Vlaams-Brabant';
  if (z >= 2000 && z <= 2999) return 'Antwerpen';
  if (z >= 3000 && z <= 3499) return 'Vlaams-Brabant';
  if (z >= 3500 && z <= 3999) return 'Limburg';
  if (z >= 8000 && z <= 8999) return 'West-Vlaanderen';
  if (z >= 9000 && z <= 9999) return 'Oost-Vlaanderen';
  return 'Onbekend';
}

function parseBeDate(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  const parts = t.split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!yyyy || yyyy.length !== 4) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function openCsv(filename: string) {
  return createReadStream(path.join(resolvedDir, filename), { encoding: 'utf-8' }).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }),
  );
}

// ── In-memory maps ──────────────────────────────────────────────────────

interface AddressInfo {
  zipcode: string;
  municipality: string;
  province: string;
}

interface DenominationInfo {
  denomination: string;
  normalized: string;
}

interface ActivityInfo {
  naceCode: string;
  naceVersion: string;
}

async function loadAddresses(): Promise<Map<string, AddressInfo>> {
  console.log('\n▸ Pass 1: address.csv → in-memory scope map (Vlaanderen/Brussel)');
  const map = new Map<string, AddressInfo>();
  let scanned = 0;
  for await (const row of openCsv('address.csv')) {
    scanned++;
    const entityNumber = row.EntityNumber?.trim();
    const rawZip = row.Zipcode?.trim();
    if (!entityNumber || !rawZip) continue;
    if (row.DateStrikingOff?.trim()) continue;
    const zipcode = normalizePostcode(rawZip);
    if (!zipcode) continue;
    if (!ALL_BE && !isFlemishOrBrussels(zipcode)) continue;
    if (map.has(entityNumber)) continue; // eerste adres wint
    map.set(entityNumber, {
      zipcode,
      municipality: row.MunicipalityNL?.trim() || row.MunicipalityFR?.trim() || '',
      province: deriveProvince(zipcode),
    });
    if (scanned % 500_000 === 0) process.stdout.write(`  ${fmt(scanned)}… (${fmt(map.size)} in scope)\n`);
  }
  console.log(`  ✓ ${fmt(map.size)} entities met geldig adres (van ${fmt(scanned)} rijen)`);
  return map;
}

async function loadDenominations(scope: Set<string>): Promise<Map<string, DenominationInfo>> {
  console.log('\n▸ Pass 2: denomination.csv → in-memory naam map (type 001 only)');
  const map = new Map<string, DenominationInfo>();
  let scanned = 0;
  for await (const row of openCsv('denomination.csv')) {
    scanned++;
    const entityNumber = row.EntityNumber?.trim();
    const denomination = row.Denomination?.trim();
    const type = row.TypeOfDenomination?.trim();
    if (!entityNumber || !denomination) continue;
    if (type !== '001') continue; // alleen officiële naam voor fast-path
    if (!scope.has(entityNumber)) continue;
    if (map.has(entityNumber)) continue;
    const normalized = normalizeBusinessName(denomination);
    if (!normalized) continue;
    map.set(entityNumber, { denomination, normalized });
    if (scanned % 500_000 === 0) process.stdout.write(`  ${fmt(scanned)}… (${fmt(map.size)} matched)\n`);
  }
  console.log(`  ✓ ${fmt(map.size)} entities met officiële naam (van ${fmt(scanned)} rijen)`);
  return map;
}

async function loadActivities(scope: Set<string>): Promise<Map<string, ActivityInfo>> {
  console.log('\n▸ Pass 3: activity.csv → in-memory NACE map (MAIN only)');
  const map = new Map<string, ActivityInfo>();
  let scanned = 0;
  for await (const row of openCsv('activity.csv')) {
    scanned++;
    const entityNumber = row.EntityNumber?.trim();
    const naceCode = row.NaceCode?.trim();
    const classification = row.Classification?.trim();
    if (!entityNumber || !naceCode) continue;
    if (classification !== 'MAIN') continue;
    if (!scope.has(entityNumber)) continue;
    const naceVersion = row.NaceVersion?.trim() || '';
    const existing = map.get(entityNumber);
    // Prefereer nieuwste versie (2025 > 2008)
    if (existing && existing.naceVersion >= naceVersion) continue;
    map.set(entityNumber, { naceCode, naceVersion });
    if (scanned % 2_000_000 === 0) process.stdout.write(`  ${fmt(scanned)}… (${fmt(map.size)} matched)\n`);
  }
  console.log(`  ✓ ${fmt(map.size)} entities met MAIN NACE (van ${fmt(scanned)} rijen)`);
  return map;
}

// ── Import hoofdfase ────────────────────────────────────────────────────

async function importLookup(
  addresses: Map<string, AddressInfo>,
  denominations: Map<string, DenominationInfo>,
  activities: Map<string, ActivityInfo>,
): Promise<number> {
  console.log('\n▸ Pass 4: enterprise.csv + in-memory join → kbo_lookup');

  if (TRUNCATE) {
    await sql`TRUNCATE TABLE kbo_lookup RESTART IDENTITY`;
    console.log('  TRUNCATE kbo_lookup');
  }

  let scanned = 0;
  let imported = 0;
  let batch: Array<{
    enterprise_number: string;
    denomination: string;
    normalized_denomination: string;
    zipcode: string;
    municipality: string;
    province: string;
    nace_code: string | null;
    nace_version: string | null;
    juridical_form: string;
    juridical_situation: string;
    type_of_enterprise: string;
    start_date: string | null;
  }> = [];

  for await (const row of openCsv('enterprise.csv')) {
    scanned++;
    const enterpriseNumber = row.EnterpriseNumber?.trim();
    if (!enterpriseNumber) continue;

    // Moet in alle 3 maps zitten (adres + naam minimaal)
    const address = addresses.get(enterpriseNumber);
    if (!address) continue;
    const denom = denominations.get(enterpriseNumber);
    if (!denom) continue;
    // Activity mag ontbreken (enterprise zonder NACE bestaat)
    const activity = activities.get(enterpriseNumber);

    // Filter enterprise-eigenschappen
    const status = row.Status?.trim();
    const typeOfEnterprise = row.TypeOfEnterprise?.trim();
    if (status !== 'AC') continue;
    if (typeOfEnterprise !== '1' && typeOfEnterprise !== '2') continue;

    batch.push({
      enterprise_number: enterpriseNumber,
      denomination: denom.denomination,
      normalized_denomination: denom.normalized,
      zipcode: address.zipcode,
      municipality: address.municipality,
      province: address.province,
      nace_code: activity?.naceCode ?? null,
      nace_version: activity?.naceVersion ?? null,
      juridical_form: row.JuridicalForm?.trim() || '',
      juridical_situation: row.JuridicalSituation?.trim() || '',
      type_of_enterprise: typeOfEnterprise,
      start_date: parseBeDate(row.StartDate),
    });
    imported++;

    if (batch.length >= BATCH_SIZE) {
      await flushLookup(batch);
      batch = [];
      if (imported % 50_000 === 0) console.log(`  ${fmt(imported)}…`);
    }
    if (imported >= LIMIT) break;
  }
  if (batch.length > 0) await flushLookup(batch);

  console.log(`  ✓ ${fmt(imported)} geschreven naar kbo_lookup (van ${fmt(scanned)} enterprise-rijen)`);
  return imported;
}

async function flushLookup(rows: unknown[]) {
  const payload = JSON.stringify(rows);
  await sql`
    INSERT INTO kbo_lookup (enterprise_number, denomination, normalized_denomination, zipcode, municipality, province, nace_code, nace_version, juridical_form, juridical_situation, type_of_enterprise, start_date)
    SELECT enterprise_number, denomination, normalized_denomination, zipcode, municipality, province, nace_code, nace_version, juridical_form, juridical_situation, type_of_enterprise, start_date::date
    FROM jsonb_to_recordset(${payload}::jsonb)
    AS x(enterprise_number text, denomination text, normalized_denomination text, zipcode text, municipality text, province text, nace_code text, nace_version text, juridical_form text, juridical_situation text, type_of_enterprise text, start_date text)
    ON CONFLICT (enterprise_number) DO UPDATE SET
      denomination = EXCLUDED.denomination,
      normalized_denomination = EXCLUDED.normalized_denomination,
      zipcode = EXCLUDED.zipcode,
      municipality = EXCLUDED.municipality,
      province = EXCLUDED.province,
      nace_code = EXCLUDED.nace_code,
      nace_version = EXCLUDED.nace_version,
      juridical_form = EXCLUDED.juridical_form,
      juridical_situation = EXCLUDED.juridical_situation,
      type_of_enterprise = EXCLUDED.type_of_enterprise,
      start_date = EXCLUDED.start_date
  `;
}

// ── Snapshot log ────────────────────────────────────────────────────────

async function logSnapshot(counts: { total: number; durationSeconds: number; snapshotDate: string }) {
  await sql`
    INSERT INTO kbo_snapshot (snapshot_date, enterprises_count, denominations_count, activities_count, addresses_count, duration_seconds, notes)
    VALUES (${counts.snapshotDate}::date, ${counts.total}, ${counts.total}, ${counts.total}, ${counts.total}, ${counts.durationSeconds}, ${`kbo_lookup consolidated import${TRUNCATE ? ' (truncate=true)' : ''}${ALL_BE ? ' (all-be)' : ' (flanders-only)'}`})
  `;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   KBO Lookup Import (v4 consolidated)    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  Data dir:    ${resolvedDir}`);
  console.log(`  Truncate:    ${TRUNCATE}`);
  console.log(`  Scope:       ${ALL_BE ? 'héél België' : 'Vlaanderen + Brussel'}`);
  console.log(`  Limit:       ${LIMIT === Infinity ? 'none' : fmt(LIMIT)}`);

  let snapshotDate = new Date().toISOString().slice(0, 10);
  try {
    for await (const row of openCsv('meta.csv')) {
      if (row.Variable === 'SnapshotDate' && row.Value) {
        const parsed = parseBeDate(row.Value);
        if (parsed) snapshotDate = parsed;
      }
    }
  } catch {
    // meta ontbreekt — niet fataal
  }
  console.log(`  Snapshot:    ${snapshotDate}\n`);

  const addresses = await loadAddresses();
  const scope = new Set(addresses.keys());
  const denominations = await loadDenominations(scope);
  const scope2 = new Set(denominations.keys()); // verkleinde scope: alleen met naam
  const activities = await loadActivities(scope2);

  const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
  console.log(`\nIn-memory maps opgebouwd (heap: ${memMB} MB)`);

  const total = await importLookup(addresses, denominations, activities);

  const durationSeconds = Math.round((Date.now() - start) / 1000);
  await logSnapshot({ total, durationSeconds, snapshotDate });

  console.log('\n══════════════════════════════════════════');
  console.log('  IMPORT COMPLETE');
  console.log('══════════════════════════════════════════');
  console.log(`  kbo_lookup:  ${fmt(total)} rows`);
  console.log(`  Duration:    ${fmt(durationSeconds)}s`);
  console.log('══════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
