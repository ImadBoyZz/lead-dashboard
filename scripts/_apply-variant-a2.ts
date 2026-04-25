// Variant A2 setup — €30/maand budget profiel.
//   - Drafts via Haiku 4.5 (€0.015/draft i.p.v. €0.07 Sonnet)
//   - Vision tiebreaker uitgeschakeld via env (TIEBREAKER_ENABLED=false)
//   - Discovery 3×/week (cron in n8n)
//   - daily_budget_eur op €1.50 (was €15) → harde stop bij €45/maand AI
//   - warmup_max_override = 25 vanaf 2 mei (handmatig op die datum runnen)
//
// Gebruik:
//   npx tsx scripts/_apply-variant-a2.ts            # zet daily_budget_eur direct
//   npx tsx scripts/_apply-variant-a2.ts --warmup   # ook warmup_max_override = 25 nu
//
// Voor 2 mei: run met --warmup om de cap te plateauen op 25/dag.

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const args = process.argv.slice(2);
const APPLY_WARMUP = args.includes('--warmup');

(async () => {
  const { setSetting, getSetting } = await import('../src/lib/settings/system-settings');

  console.log('=== Variant A2: €30/maand budget profiel ===\n');

  const budgetBefore = await getSetting('daily_budget_eur');
  await setSetting('daily_budget_eur', 1.5, 'imad-variant-a2');
  console.log(`✓ daily_budget_eur: ${budgetBefore} → 1.5 (=€45/maand AI hard cap)`);

  if (APPLY_WARMUP) {
    const overrideBefore = await getSetting('warmup_max_override');
    await setSetting('warmup_max_override', 25, 'imad-variant-a2');
    console.log(`✓ warmup_max_override: ${overrideBefore} → 25 (plateau op 25/dag)`);
  } else {
    const startDate = await getSetting('warmup_start_date');
    if (startDate) {
      const start = new Date(startDate);
      const day14 = new Date(start.getTime() + 14 * 86400_000);
      console.log(`⏭ warmup_max_override NIET gezet — run dit script met --warmup vanaf ${day14.toISOString().slice(0,10)} om op 25/dag te plateauen`);
    }
  }

  console.log('\n=== Volgende stappen ===');
  console.log('1. Vercel env: zet TIEBREAKER_ENABLED=false (anders blijft Opus tiebreaker draaien)');
  console.log('2. Push deze branch naar production');
  console.log('3. Op 2 mei (of later): npx tsx scripts/_apply-variant-a2.ts --warmup');
  console.log('4. Monitor /autonomy dashboard — verwacht stabiele cost-per-mail rond €0.04');

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
