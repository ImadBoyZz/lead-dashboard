// Plateau de warmup ramp op een vaste cap. Override vervangt de stage-based ramp
// in lib/deliverability/warmup.ts. Default: 25/dag voor Variant A2 budget.
//
// Gebruik:
//   npx tsx scripts/_set-warmup-cap.ts          # zet op 25/dag
//   npx tsx scripts/_set-warmup-cap.ts 50       # zet op 50/dag
//   npx tsx scripts/_set-warmup-cap.ts off      # verwijder override (terug naar natuurlijke ramp)

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const arg = process.argv[2] ?? '25';
  const { setSetting, getSetting } = await import('../src/lib/settings/system-settings');
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');

  if (arg === 'off' || arg === 'remove') {
    await db.execute(sql`DELETE FROM system_settings WHERE key = 'warmup_max_override'`);
    console.log('✓ warmup_max_override verwijderd — terug naar natuurlijke ramp.');
    process.exit(0);
  }

  const cap = parseInt(arg, 10);
  if (!Number.isFinite(cap) || cap < 1 || cap > 500) {
    console.error('Ongeldig getal. Gebruik: 1-500 of "off".');
    process.exit(1);
  }

  await setSetting('warmup_max_override', cap, 'imad');
  const check = await getSetting('warmup_max_override');
  console.log(`✓ warmup_max_override = ${check} (${arg}/dag, vervangt natuurlijke ramp)`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
