// Minimal Telegram notifier voor auto-pause en silent-failure alerts.
// Faalt stil als env vars ontbreken — caller hoeft niet te wrappen in try/catch.

import { env } from '@/lib/env';

export interface TelegramAlertResult {
  sent: boolean;
  reason?: string;
}

/**
 * Stuurt een eenvoudige Markdown-formatted alert naar de geconfigureerde
 * Telegram chat. Gebruikt Bot API `sendMessage`. Logt op console bij failure
 * maar gooit nooit — alerting mag nooit de caller-flow breken.
 */
export async function sendTelegramAlert(
  title: string,
  body: string,
): Promise<TelegramAlertResult> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { sent: false, reason: 'telegram_env_missing' };
  }

  const text = `*${escapeMarkdown(title)}*\n\n${body}`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[telegram] sendMessage failed', res.status, detail);
      return { sent: false, reason: `http_${res.status}` };
    }

    return { sent: true };
  } catch (err) {
    console.error('[telegram] fetch error', err);
    return { sent: false, reason: 'fetch_error' };
  }
}

// Telegram Markdown V1 vereist escape van _ * [ ] ( ) ~ ` > # + - = | { } . !
// We gebruiken Markdown (V1) voor eenvoud — alleen * en _ escape'n is genoeg.
function escapeMarkdown(input: string): string {
  return input.replace(/([*_`\[])/g, '\\$1');
}
