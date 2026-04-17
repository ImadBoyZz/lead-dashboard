// Maandelijkse KBO refresh: download nieuwste ZIP, unzip, run import, run backfill
// op leads die geen match hadden. Plan: ik-heb-eigenlijk-een-merry-oasis.md §Chunk 4.
//
// n8n roept dit script aan via SSH/cron, of Vercel cron schedult een webhook die
// dit uitvoert op een dedicated VPS/container (Neon HTTP kan geen 2GB CSV in
// een serverless function verwerken).
//
// Gebruik:
//   npx tsx scripts/kbo-monthly-refresh.ts         (full refresh: download + import + backfill)
//   npx tsx scripts/kbo-monthly-refresh.ts --skip-download   (als CSVs al op disk staan)
//   npx tsx scripts/kbo-monthly-refresh.ts --skip-backfill   (alleen staging updaten)

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const SKIP_DOWNLOAD = args.includes('--skip-download');
const SKIP_BACKFILL = args.includes('--skip-backfill');

const DATA_DIR = path.resolve('./kbo-data');

function runCmd(cmd: string, cmdArgs: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n▸ ${label}`);
    console.log(`  ${cmd} ${cmdArgs.join(' ')}\n`);
    const child = spawn(cmd, cmdArgs, { stdio: 'inherit', shell: true });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} faalde met exit code ${code}`));
    });
  });
}

async function main() {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   KBO Monthly Refresh Runner             ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  Data dir:      ${DATA_DIR}`);
  console.log(`  Skip download: ${SKIP_DOWNLOAD}`);
  console.log(`  Skip backfill: ${SKIP_BACKFILL}`);

  // Stap 1: download (optioneel)
  if (!SKIP_DOWNLOAD) {
    // KBO Open Data dump URL vereist login — gebruiker moet dit via Combell/curl-job elders regelen.
    // In de n8n workflow doet een HTTP Request node de download + unzip naar ./kbo-data.
    // Dit script neemt aan dat CSVs al op disk staan.
    console.log(
      '\n  ℹ Download-stap wordt overgeslagen: KBO Open Data vereist handmatige login.',
    );
    console.log('    Zet de CSVs in ./kbo-data/ en run daarna dit script met --skip-download');
    console.log(
      '    (Of bouw een n8n workflow die de ZIP download + unzip naar ./kbo-data/ vóór dit script.)',
    );
  }

  // Sanity: bestanden aanwezig?
  const required = ['enterprise.csv', 'denomination.csv', 'activity.csv', 'address.csv'];
  for (const f of required) {
    const p = path.join(DATA_DIR, f);
    if (!existsSync(p)) {
      throw new Error(`Missing file: ${p}. Download KBO ZIP en extract eerst.`);
    }
  }

  // Stap 2: import (truncate + herladen)
  await runCmd('npx', ['tsx', 'scripts/kbo-import.ts', './kbo-data', '--truncate'], 'KBO import');

  // Stap 3: backfill alle unmatched leads
  if (!SKIP_BACKFILL) {
    await runCmd('npx', ['tsx', 'scripts/kbo-backfill.ts'], 'KBO backfill (unmatched leads)');
  }

  const duration = Math.round((Date.now() - start) / 1000);
  console.log('\n══════════════════════════════════════════');
  console.log(`  REFRESH COMPLETE — ${duration}s`);
  console.log('══════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
