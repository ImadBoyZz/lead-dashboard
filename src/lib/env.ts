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
  N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET ?? '',
  AGENT_WEBHOOK_SECRET: process.env.AGENT_WEBHOOK_SECRET ?? '',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  // AI Provider configuratie
  AI_PROVIDER: (process.env.AI_PROVIDER ?? 'anthropic') as 'anthropic' | 'openai',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
} as const;
