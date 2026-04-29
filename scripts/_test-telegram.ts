import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { sendTelegramAlert } = await import('../src/lib/notify/telegram');

  const result = await sendTelegramAlert(
    'Lead Dashboard — Telegram setup OK',
    [
      'Als je dit leest werkt de Telegram notifier.',
      '',
      'Dit kanaal krijgt voortaan alerts bij:',
      '• Auto-pause (bounce>2% of complaint>0.1% 7d)',
      '• Backup alerts vanuit n8n als endpoint stil blijft',
      '',
      'Vandaag: nog geen productie-traffic, geen alerts verwacht.',
    ].join('\n'),
  );

  console.log(JSON.stringify(result, null, 2));
})();
