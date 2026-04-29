// Voert 0015_batch_runs.sql en 0016_auto_promoted_at.sql idempotent uit
// tegen de DB geconfigureerd in .env.local. Beide scripts gebruiken
// IF NOT EXISTS, dus dubbele runs doen niks.

import { config } from 'dotenv';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

config({ path: path.resolve(process.cwd(), '.env.local') });

const MIGRATION_FILES = [
  'src/lib/db/migrations/0015_batch_runs.sql',
  'src/lib/db/migrations/0016_auto_promoted_at.sql',
];

/** Split SQL script op semicolons die niet in een string literal zitten. */
function splitStatements(sqlText: string): string[] {
  const withoutComments = sqlText
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL ontbreekt in .env.local');
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  for (const file of MIGRATION_FILES) {
    console.log(`\n── ${file} ──`);
    const full = await readFile(path.resolve(process.cwd(), file), 'utf8');
    const statements = splitStatements(full);
    for (const stmt of statements) {
      const preview = stmt.replace(/\s+/g, ' ').slice(0, 90);
      try {
        await sql.query(stmt);
        console.log(`  ✓ ${preview}${stmt.length > 90 ? '…' : ''}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${preview}`);
        console.error(`    ${msg}`);
        process.exit(1);
      }
    }
  }

  // Verificatie
  console.log('\n── Verificatie ──');
  const batchRunsCheck = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'batch_runs'
    ORDER BY ordinal_position
  `;
  console.log(`  batch_runs kolommen: ${batchRunsCheck.map((r) => r.column_name).join(', ')}`);

  const autoPromoteCheck = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'auto_promoted_at'
  `;
  console.log(
    `  businesses.auto_promoted_at aanwezig: ${autoPromoteCheck.length > 0 ? 'JA' : 'NEE'}`,
  );

  const indexCheck = await sql`
    SELECT indexname FROM pg_indexes
    WHERE indexname IN (
      'batch_runs_job_date_idx',
      'batch_runs_status_idx',
      'batch_runs_discover_idempotency_idx',
      'businesses_auto_promoted_at_idx'
    )
    ORDER BY indexname
  `;
  console.log(`  Indexes: ${indexCheck.map((r) => r.indexname).join(', ')}`);

  console.log('\nKlaar.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
