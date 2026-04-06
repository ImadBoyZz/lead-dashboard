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
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
} as const;
