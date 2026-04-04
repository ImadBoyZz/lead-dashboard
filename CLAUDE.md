# Lead Dashboard

## Overview
Intern lead generatie dashboard voor Averis Solutions. Vindt bedrijven in Vlaanderen en Nederland met slechte/geen website en scoort ze automatisch.

## Stack
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- Drizzle ORM + Neon Postgres
- Lucide Icons, Inter font
- n8n (Hostinger VPS) als data engine

## Architectuur
- **n8n** pusht data naar `/api/sync` en `/api/audit` (Bearer token auth)
- **Dashboard** toont gescoorde leads, pipeline, en settings
- **Neon Postgres** is de gedeelde database

## Commando's
```bash
npm run dev          # Dev server
npm run build        # Productie build
npx drizzle-kit generate  # Genereer migraties
npx drizzle-kit push      # Push schema naar DB
```

## Env variabelen
- `DATABASE_URL` — Neon Postgres connection string
- `N8N_WEBHOOK_SECRET` — Bearer token voor n8n authenticatie
- `NEXT_PUBLIC_APP_URL` — App URL (default: http://localhost:3000)

## Scoring
Bedrijven worden gescoord 0-100. Hogere score = betere lead.
- Geen website: +30, Slechte PageSpeed: +12-20, Geen SSL: +10
- Modern framework: -15, IT sector: -20
- Scoring logica in `src/lib/scoring.ts`
