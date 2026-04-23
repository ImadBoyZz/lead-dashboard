import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { setSetting, getSetting } = await import('../src/lib/settings/system-settings');

  // Start vanaf morgen (2026-04-18) zodat de eerste dag met nieuwe outreach
  // niet vandaag al half verbruikt is.
  const startDate = '2026-04-18';
  await setSetting('warmup_start_date', startDate, 'agent');

  const check = await getSetting('warmup_start_date');
  console.log('warmup_start_date gezet op:', check);

  const { getWarmupStatus } = await import('../src/lib/deliverability/warmup');
  const status = await getWarmupStatus();
  console.log('\nWarmup status:');
  console.log('  stage:', status.stage);
  console.log('  currentDay:', status.currentDay);
  console.log('  maxSendsToday:', status.maxSendsToday);
})().catch((e) => { console.error(e); process.exit(1); });
