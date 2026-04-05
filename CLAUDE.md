# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview
Intern lead generatie dashboard voor Averis Solutions. Vindt bedrijven in Vlaanderen en Nederland met slechte/geen website en scoort ze automatisch als potentiele klanten voor webdesign/AI diensten.

## Commando's
```bash
npm run dev                    # Dev server
npm run build                  # Productie build
npm run lint                   # ESLint
npm run seed                   # Seed database (npx tsx src/lib/db/seed.ts)
npm run kbo-import             # KBO bulk import script
npm run kbo-staging            # KBO staging import script
npx drizzle-kit generate       # Genereer migraties
npx drizzle-kit push           # Push schema naar DB
npx tsx scripts/rescore-leads.ts  # Herbereken alle lead scores
```

## Stack
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- Drizzle ORM + Neon Postgres (`@neondatabase/serverless`)
- Zod voor validatie, `@dnd-kit` voor drag-and-drop pipeline
- Lucide Icons, Inter font
- n8n (Hostinger VPS) als externe data engine

## Env variabelen
- `DATABASE_URL` — Neon Postgres connection string
- `N8N_WEBHOOK_SECRET` — Bearer token voor n8n authenticatie
- `NEXT_PUBLIC_APP_URL` — App URL (default: http://localhost:3000)

## Architectuur

### Data pipeline
n8n workflows scrapen bedrijfsdata (KBO/KVK) en pushen naar de app via API routes:
1. **`/api/sync`** — Ontvangt bedrijfsdata van n8n, upsert op `(registryId, country)`, maakt automatisch `leadStatuses` en `leadScores` rijen aan voor nieuwe bedrijven
2. **`/api/audit`** — Ontvangt website audit resultaten, slaat op in `auditResults`, triggert automatisch herberekening van lead score
3. **`/api/enrich/google-places`** — Google Places enrichment voor bedrijfsdata

Alle n8n endpoints authenticeren via `Bearer` token (`N8N_WEBHOOK_SECRET`).

### Smart Import flow
Naast directe n8n sync is er een staging-systeem:
- KBO data wordt eerst in `kboCandidates` tabel geladen (staging)
- `pre-scoring.ts` berekent een pre-score op basis van NACE code, postcode, etc.
- `candidate-filters.ts` filtert kandidaten voor smart import
- `/api/leads/smart-import` importeert gefilterde kandidaten naar `businesses`
- Import profielen (`importProfiles`) definiëren herbruikbare filtersets

### Scoring systeem
Bedrijven worden gescoord 0-100 in `src/lib/scoring.ts`. Hogere score = betere lead.
- Geen website: +30, Slechte PageSpeed: +12-20, Geen SSL: +10
- Modern framework: -15, IT sector: -20
- NACE codes zijn ingedeeld in tiers (tier 1 = doelniches zoals horeca, bouw, vastgoed) in `src/lib/nace-config.ts`
- Pre-scoring (`src/lib/pre-scoring.ts`) voor kandidaten voordat ze geaudit zijn

### Database schema (Drizzle)
Schema in `src/lib/db/schema.ts`, migraties in `src/lib/db/migrations/`.
Centrale entiteit is `businesses` met 1:1 relaties naar:
- `auditResults` — website audit data (PageSpeed, SSL, CMS, etc.)
- `leadScores` — berekende score + breakdown
- `leadStatuses` — legacy status tracking (new/contacted/replied/meeting/won/lost)
- `leadPipeline` — uitgebreide pipeline stage + priority + deal value

En 1:many relaties naar:
- `notes`, `statusHistory`, `outreachLog`, `reminders`

Standalone tabellen: `kboCandidates` (staging), `importProfiles`, `importLogs`, `outreachTemplates`.

Unique constraint op `businesses(registryId, country)` — dit is de upsert key voor sync.

### Pipeline & CRM
- Pipeline board met drag-and-drop (`@dnd-kit`) in `/pipeline`
- `pipeline-logic.ts` synct pipeline stage changes naar legacy `leadStatuses`
- Outreach logging per kanaal (email, phone, linkedin, whatsapp)
- Reminder systeem met auto-generatie (`auto-reminders.ts`)
- Template systeem voor outreach berichten (`templates.ts`)

### Frontend pagina's
- `/` — Dashboard met stats
- `/leads` — Lead overzicht met filters, sortering, paginatie
- `/leads/[id]` — Lead detail met audit data, notities, outreach, status
- `/pipeline` — Kanban-style pipeline board
- `/reminders` — Reminder overzicht
- `/settings` — GDPR opt-out beheer

### API route patronen
Alle API routes in `src/app/api/`. CRUD routes volgen het patroon:
- `route.ts` voor GET (lijst) en POST (create)
- `[id]/route.ts` voor GET (detail), PATCH (update), DELETE
