// Env validatie — crasht bij startup als vereiste vars ontbreken

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  DASHBOARD_PASSWORD: requireEnv('DASHBOARD_PASSWORD'),
  DASHBOARD_SECRET: requireEnv('DASHBOARD_SECRET'),
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ?? '',
  GOOGLE_PLACES_MOCK: process.env.GOOGLE_PLACES_MOCK === 'true',
  PLACES_API_MAX_CALLS: parseInt(process.env.PLACES_API_MAX_CALLS ?? '250', 10),
  N8N_WEBHOOK_SECRET: requireEnv('N8N_WEBHOOK_SECRET'),
  AGENT_WEBHOOK_SECRET: requireEnv('AGENT_WEBHOOK_SECRET'),
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  // AI Provider configuratie
  AI_PROVIDER: (process.env.AI_PROVIDER ?? 'anthropic') as 'anthropic' | 'openai',
  ANTHROPIC_API_KEY: (process.env.ANTHROPIC_API_KEY ?? '').trim(),
  OPENAI_API_KEY: (process.env.OPENAI_API_KEY ?? '').trim(),
  // Gmail OAuth (trim tegen trailing newlines uit Vercel env) — blijft voor reply thread reading
  GMAIL_CLIENT_ID: (process.env.GMAIL_CLIENT_ID ?? '').trim(),
  GMAIL_CLIENT_SECRET: (process.env.GMAIL_CLIENT_SECRET ?? '').trim(),
  GMAIL_REFRESH_TOKEN: (process.env.GMAIL_REFRESH_TOKEN ?? '').trim(),
  GMAIL_SENDER_EMAIL: (process.env.GMAIL_SENDER_EMAIL ?? '').trim(),
  // Resend — primary outbound sender via averissolutions.be
  RESEND_API_KEY: (process.env.RESEND_API_KEY ?? '').trim(),
  RESEND_FROM_EMAIL: (process.env.RESEND_FROM_EMAIL ?? 'imad@averissolutions.be').trim(),
  RESEND_FROM_NAME: (process.env.RESEND_FROM_NAME ?? 'Imad Bardid').trim(),
  RESEND_WEBHOOK_SECRET: (process.env.RESEND_WEBHOOK_SECRET ?? '').trim(),
  // Unsubscribe HMAC signing key (verschillend van DASHBOARD_SECRET)
  UNSUBSCRIBE_SECRET: (process.env.UNSUBSCRIBE_SECRET ?? process.env.DASHBOARD_SECRET ?? '').trim(),
} as const;
