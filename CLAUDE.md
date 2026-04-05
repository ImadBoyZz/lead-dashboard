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
npx drizzle-kit generate       # Genereer migraties
npx drizzle-kit push           # Push schema naar DB
npx tsx scripts/rescore-leads.ts  # Herbereken alle lead scores
GOOGLE_PLACES_MOCK=true npm run dev  # Dev server met mock Places data
```

## Stack
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- Drizzle ORM + Neon Postgres (`@neondatabase/serverless`)
- Zod voor validatie, `@dnd-kit` voor drag-and-drop pipeline
- Lucide Icons, Inter font
- Google Places API (Text Search) als lead discovery engine

## Env variabelen
- `DATABASE_URL` — Neon Postgres connection string
- `GOOGLE_PLACES_API_KEY` — Google Places API key voor lead discovery
- `GOOGLE_PLACES_MOCK` — `true` om mock data te gebruiken i.p.v. echte API calls
- `PLACES_API_MAX_CALLS` — Max aantal API calls per import (rate limiting)
- `NEXT_PUBLIC_APP_URL` — App URL (default: http://localhost:3000)

## Architectuur

### Data pipeline
Google Places Text Search API is de primaire lead source:
1. **`/api/leads/smart-import`** (GET) — Preview van leads voor een sector + city zoekopdracht
2. **`/api/leads/smart-import`** (POST) — Importeert leads naar `businesses` met scores
3. Leads worden ontdekt via sector + city search tegen de Places API
4. Scoring gebeurt direct bij import met volledige Google data (rating, reviews, website, etc.)

### Smart Import flow
User selecteert sector + city in de UI:
1. Places API Text Search haalt bedrijven op voor de zoekopdracht
2. Preview toont gevonden bedrijven met beschikbare data
3. Import slaat geselecteerde bedrijven op in `businesses` met volledige scores
4. Scoring en MaturityCluster classificatie worden direct berekend bij import

### Scoring systeem
Bedrijven worden gescoord 0-100 in `src/lib/scoring.ts`. Hogere score = betere lead.
- Data is altijd compleet bij import (volledige Google Places data beschikbaar)
- 6 dimensies: Opportunity, Activity, Reachability, Budget, Spanning, Momentum
- MaturityCluster classificatie (A/B/C/D) bepaalt lead kwaliteit
- Scoring gebeurt bij import, niet als aparte stap

### Database schema (Drizzle)
Schema in `src/lib/db/schema.ts`, migraties in `src/lib/db/migrations/`.
Centrale entiteit is `businesses` met 1:1 relaties naar:
- `auditResults` — website audit data (PageSpeed, SSL, CMS, etc.)
- `leadScores` — berekende score + breakdown
- `leadStatuses` — status tracking (new/contacted/meeting/won/ignored)
- `leadPipeline` — pipeline stage + priority + deal value

En 1:many relaties naar:
- `notes`, `statusHistory`, `outreachLog`, `reminders`

Standalone tabellen: `importLogs`, `outreachTemplates`.

### Pipeline & CRM
- Pipeline board met drag-and-drop (`@dnd-kit`) in `/pipeline` — 5 stages: new, contacted, meeting, won, ignored
- `pipeline-logic.ts` synct pipeline stage changes naar `leadStatuses`
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
