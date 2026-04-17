// Pas een losse .sql migratie file toe op de database via Neon HTTP.
// Gebruik: npx tsx scripts/apply-migration.ts <migration-file-name>
// Voorbeeld: npx tsx scripts/apply-migration.ts 0007_fase1_classification_dlq_batches.sql

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  const filename = process.argv[2];
  if (!filename) {
    console.error('Gebruik: npx tsx scripts/apply-migration.ts <migration-file-name>');
    process.exit(1);
  }

  const migrationPath = resolve('src/lib/db/migrations', filename);
  const rawSql = readFileSync(migrationPath, 'utf8');

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL ontbreekt in .env.local');
    process.exit(1);
  }

  const { neon } = await import('@neondatabase/serverless');
  const client = neon(url);

  // Dollar-quote aware splitter: behandelt DO $$ ... $$ blocks als één statement.
  const statements: string[] = [];
  let buf = '';
  let inDollar = false;
  for (let i = 0; i < rawSql.length; i++) {
    const c = rawSql[i];
    const next2 = rawSql.slice(i, i + 2);
    if (next2 === '$$') {
      inDollar = !inDollar;
      buf += '$$';
      i++;
      continue;
    }
    if (c === ';' && !inDollar) {
      const stmt = buf.trim();
      if (stmt.length > 0 && !stmt.split('\n').every((l) => l.trim().startsWith('--') || l.trim() === '')) {
        statements.push(stmt);
      }
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim().length > 0) {
    const stmt = buf.trim();
    if (!stmt.split('\n').every((l) => l.trim().startsWith('--') || l.trim() === '')) {
      statements.push(stmt);
    }
  }

  console.log(`Toepassen van ${statements.length} statements uit ${filename}...\n`);

  let ok = 0;
  let skipped = 0;
  for (const [i, stmt] of statements.entries()) {
    const preview = stmt.slice(0, 80).replace(/\s+/g, ' ');
    try {
      // neon http client wil geen trailing ';' in losse statements
      await client.query(stmt.endsWith(';') ? stmt : stmt + ';');
      ok++;
      console.log(`  ${String(i + 1).padStart(2)}. OK    ${preview}${stmt.length > 80 ? '…' : ''}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate_object') ||
        msg.includes('duplicate key')
      ) {
        skipped++;
        console.log(`  ${String(i + 1).padStart(2)}. SKIP  ${preview} (${msg.split('\n')[0]})`);
      } else {
        console.error(`\nFOUT op statement ${i + 1}:`);
        console.error(stmt);
        console.error(`\n→ ${msg}\n`);
        process.exit(1);
      }
    }
  }

  console.log(`\nKlaar: ${ok} toegepast, ${skipped} overgeslagen (al aanwezig).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
