# Lead Dashboard — Smart Import & Lead Management Implementatieplan

> Dit document bevat ALLES wat een agent met lege context nodig heeft om het complete systeem te bouwen.

## Project Info

- **Locatie:** `c:\Users\bardi\OneDrive\Bureaublad\Projects\lead-dashboard`
- **Stack:** Next.js 16.2.2, React 19.2.4, TypeScript 5, Tailwind CSS v4, Drizzle ORM 0.45.2, Neon Postgres (serverless HTTP), Zod v4, Lucide Icons
- **DB Driver:** `@neondatabase/serverless` + `drizzle-orm/neon-http` (geen connection pool, geen transacties)
- **Dev:** `npm run dev`, **Build:** `npm run build`, **Migratie:** `npx drizzle-kit generate` + `npx drizzle-kit push`

## Wat er al bestaat

### Bestaande DB Schema (`src/lib/db/schema.ts`)

```typescript
// Enums
countryEnum: 'BE' | 'NL'
dataSourceEnum: 'kbo_bulk' | 'kvk_open' | 'google_places' | 'manual'
leadStatusEnum: 'new' | 'contacted' | 'replied' | 'meeting' | 'won' | 'lost' | 'disqualified'
importStatusEnum: 'running' | 'completed' | 'failed'

// Tabellen (alle PK = uuid().defaultRandom())
businesses       — registryId, country, name, legalForm, naceCode, naceDescription, foundedDate,
                   street, houseNumber, postalCode, city, province, website, email, phone,
                   googlePlaceId, googleRating, googleReviewCount, dataSource, optOut, optOutAt,
                   createdAt, updatedAt
                   UNIQUE INDEX: (registryId, country)

auditResults     — businessId FK, hasWebsite, websiteUrl, pagespeedMobileScore, pagespeedDesktopScore,
                   hasSsl, sslExpiry, isMobileResponsive, detectedCms, detectedTechnologies,
                   hasGoogleAnalytics, hasGoogleTagManager, hasCookieBanner, hasMetaDescription, etc.

leadScores       — businessId FK UNIQUE, totalScore (int 0-100), scoreBreakdown (jsonb), scoredAt

leadStatuses     — businessId FK UNIQUE, status (leadStatusEnum), statusChangedAt, contactedAt,
                   contactMethod, repliedAt, meetingAt, closedAt, closedReason

notes            — businessId FK, content (text), createdAt

statusHistory    — businessId FK, fromStatus, toStatus, changedAt

importLogs       — source, status, totalRecords, newRecords, updatedRecords, errorCount, errorDetails
```

### Bestaande Relations
```typescript
businesses → auditResult (one), leadScore (one), leadStatus (one), notes (many), statusHistory (many)
```

### DB Instance (`src/lib/db/index.ts`)
```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

### Bestaande Scoring (`src/lib/scoring.ts`)
```typescript
// computeScore(input: ScoreInput): ScoreResult
// Positief: geen website +30, slechte PageSpeed +12-20, geen SSL +10, geen responsive +10
// Negatief: modern framework -15, goede speed -10, IT sector -20
// Returns: { totalScore: 0-100, breakdown: Record<string, { points, reason }> }
```

### Bestaande Constants (`src/lib/constants.ts`)
```typescript
LEAD_STATUS_OPTIONS    — [{value, label, color}] voor 7 statussen
COUNTRY_OPTIONS        — BE, NL
BELGIAN_PROVINCES      — array van alle Belgische provincies
TARGET_NACE_CODES      — object per sector: Horeca, Retail, Bouw, Vastgoed, Auto, Vrije beroepen, IT/Tech
ITEMS_PER_PAGE         — 25
SORT_OPTIONS           — score, name, city, founded, recent
```

### Bestaande Sync API (`src/app/api/sync/route.ts`)
- Bearer token auth via `authenticateN8n()` — checkt `N8N_WEBHOOK_SECRET`
- Zod validatie van business array
- Per business: INSERT met `onConflictDoUpdate` op (registryId, country)
- Bij nieuwe insert: maakt ook `leadStatuses` (status='new') en `leadScores` (score=0) rows
- Detecteert insert vs update via `createdAt ≈ updatedAt` timestamp vergelijking
- Logged alles naar `importLogs`

### Bestaande Leads Pagina (`src/app/leads/page.tsx`)
- Server Component met `force-dynamic`
- Query: businesses LEFT JOIN leadScores, leadStatuses, auditResults
- Filters: country, province, status, scoreMin/Max, search, naceCode, hasWebsite
- Sort: score (default desc), name, city, founded, recent
- Pagination met ITEMS_PER_PAGE=25
- Header met CSV Export knop (→ hiernaast komt SmartImportButton)

### Bestaande Sidebar (`src/components/layout/sidebar.tsx`)
```typescript
const navigation = [
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Pipeline", href: "/pipeline", icon: KanbanSquare },
  { name: "Settings", href: "/settings", icon: Settings },
];
```

### Bestaande UI Components
- `Button` (`src/components/ui/button.tsx`) — variant: primary/secondary/ghost/danger, size: sm/md
- `Card` (`src/components/ui/card.tsx`) — wrapper met padding
- `Badge` (`src/components/ui/badge.tsx`) — small label
- `Header` (`src/components/layout/header.tsx`) — title, description, actions slot
- `Pagination` (`src/components/ui/pagination.tsx`) — currentPage, totalPages, basePath
- `ScoreBadge` (`src/components/leads/score-badge.tsx`) — color-coded score display
- `LeadFilters` (`src/components/leads/lead-filters.tsx`) — filter bar (client component)

### Bestaande Pipeline Pagina (`src/app/pipeline/page.tsx`)
- Server Component, groepeert leads per status
- Simpele kaarten per lead per kolom
- GEEN drag-and-drop momenteel

---

## WAT ER GEBOUWD MOET WORDEN

### Fase 1: Smart Import Systeem

#### Stap 1: Schema uitbreiding in `src/lib/db/schema.ts`

Voeg toe NA de bestaande code:

```typescript
// ── Nieuwe Enums ──────────────────────────────────────

export const candidateStatusEnum = pgEnum('candidate_status', [
  'pending',
  'imported',
  'skipped',
]);

// ── KBO Candidates (staging tabel) ────────────────────

export const kboCandidates = pgTable(
  'kbo_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registryId: text('registry_id').notNull(),
    name: text('name').notNull(),
    legalForm: text('legal_form'),
    naceCode: text('nace_code'),
    foundedDate: date('founded_date'),
    street: text('street'),
    houseNumber: text('house_number'),
    postalCode: text('postal_code').notNull(),
    city: text('city'),
    province: text('province'),
    website: text('website'),
    email: text('email'),
    phone: text('phone'),
    preScore: integer('pre_score').notNull().default(0),
    scoreBreakdown: jsonb('score_breakdown').default(sql`'{}'::jsonb`),
    status: candidateStatusEnum('status').notNull().default('pending'),
    importedAt: timestamp('imported_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('kbo_candidates_registry_id_idx').on(table.registryId),
    index('kbo_candidates_status_idx').on(table.status),
    index('kbo_candidates_pre_score_idx').on(table.preScore),
    index('kbo_candidates_nace_code_idx').on(table.naceCode),
    index('kbo_candidates_postal_code_idx').on(table.postalCode),
  ],
);

// ── Import Profiles ───────────────────────────────────

export const importProfiles = pgTable('import_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  filters: jsonb('filters').notNull().default(sql`'{}'::jsonb`),
  batchSize: integer('batch_size').notNull().default(50),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Relations toevoegen:**
```typescript
export const kboCandidatesRelations = relations(kboCandidates, ({}) => ({}));
export const importProfilesRelations = relations(importProfiles, ({}) => ({}));
```

#### Stap 2: Migratie uitvoeren
```bash
npx drizzle-kit generate
npx drizzle-kit push
```

#### Stap 3: NACE Config (`src/lib/nace-config.ts` — NIEUW)

```typescript
// NACE Tier 1 — hoge waarde leads voor webdesign/AI agency
export const NACE_TIER1_PREFIXES = [
  '43',    // Gespecialiseerde bouw (HVAC, elektra, dakwerk, schilderwerk)
  '41',    // Algemene bouw
  '56',    // Restaurants, cafes, catering
  '55',    // Hotels, B&Bs, vakantiewoningen
  '862',   // Huisartsen, tandartsen, specialisten
  '869',   // Kinesitherapie, paramedisch
  '68',    // Vastgoed (makelaars, beheer)
  '691',   // Advocaten, notarissen
  '692',   // Accountants, boekhouders
  '9602',  // Kappers, schoonheidssalons
  '9604',  // Wellness, sauna
  '931',   // Fitness, sportclubs
  '45',    // Autohandel, garages
  '711',   // Architecten, ingenieurs
  '81',    // Schoonmaak, facility
  '477',   // Kledingwinkels, speciaalzaken
] as const;

// NACE Tier 2 — medium waarde
export const NACE_TIER2_PREFIXES = [
  '46',    // Groothandel
  '47',    // Overige detailhandel
  '494',   // Goederentransport
  '10',    // Voedingsindustrie
  '855',   // Rijscholen, opleidingscentra
] as const;

// Blacklist — nooit importeren
export const NACE_BLACKLIST_PREFIXES = [
  '62',    // IT/software (concurrenten)
  '63',    // Data/webhosting (concurrenten)
  '731',   // Reclamebureaus (concurrenten)
  '84',    // Overheid
  '94',    // Verenigingen/vakbonden
  '64', '65', '66',  // Financiele sector
  '01', '02', '03',  // Landbouw/visserij
  '7010',  // Holdings
] as const;

// Rechtsvorm codes
export const LEGAL_FORM_INCLUDE = ['014', '015', '016', '017', '018', '001'] as const;
export const LEGAL_FORM_EXCLUDE = ['027', '019'] as const;

export function getNaceTier(naceCode: string | null): 1 | 2 | null {
  if (!naceCode) return null;
  if (NACE_TIER1_PREFIXES.some(p => naceCode.startsWith(p))) return 1;
  if (NACE_TIER2_PREFIXES.some(p => naceCode.startsWith(p))) return 2;
  return null;
}

export function isNaceBlacklisted(naceCode: string | null): boolean {
  if (!naceCode) return false;
  return NACE_BLACKLIST_PREFIXES.some(p => naceCode.startsWith(p));
}

export function isLegalFormAllowed(legalForm: string | null): boolean {
  if (!legalForm) return true; // als onbekend, laat door
  if ((LEGAL_FORM_EXCLUDE as readonly string[]).includes(legalForm)) return false;
  return true;
}
```

#### Stap 4: Import Profile Types (`src/lib/types/import-profile.ts` — NIEUW)

```typescript
export interface ImportProfileFilters {
  naceTier1?: string[];
  naceBlacklist?: string[];
  legalFormInclude?: string[];
  legalFormExclude?: string[];
  provinces?: string[];
  hasWebsite?: boolean | null;
  hasEmail?: boolean | null;
  hasPhone?: boolean | null;
  minPreScore?: number;
}
```

#### Stap 5: Pre-Import Scoring (`src/lib/pre-scoring.ts` — NIEUW)

```typescript
import { getNaceTier } from './nace-config';

interface PreScoreInput {
  naceCode: string | null;
  legalForm: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
}

interface PreScoreResult {
  totalScore: number;
  breakdown: Record<string, { points: number; reason: string }>;
}

export function computePreScore(input: PreScoreInput): PreScoreResult {
  const breakdown: Record<string, { points: number; reason: string }> = {};
  let score = 40; // basis

  // NACE tier scoring
  const tier = getNaceTier(input.naceCode);
  if (tier === 1) {
    breakdown.naceTier1 = { points: 20, reason: 'NACE Tier 1 sector' };
  } else if (tier === 2) {
    breakdown.naceTier2 = { points: 10, reason: 'NACE Tier 2 sector' };
  }

  // Rechtsvorm scoring
  if (input.legalForm === '014' || input.legalForm === '015') {
    breakdown.legalForm = { points: 15, reason: 'BV/NV rechtsvorm' };
  } else if (['016', '017', '018'].includes(input.legalForm ?? '')) {
    breakdown.legalForm = { points: 8, reason: 'CV/VOF/CommV rechtsvorm' };
  }

  // Website
  if (!input.website) {
    breakdown.noWebsite = { points: 15, reason: 'Geen website — kans!' };
  } else {
    breakdown.hasWebsite = { points: -5, reason: 'Heeft al website' };
  }

  // Contact info
  if (input.email) {
    breakdown.hasEmail = { points: 5, reason: 'Email beschikbaar' };
  }
  if (input.phone) {
    breakdown.hasPhone = { points: 3, reason: 'Telefoon beschikbaar' };
  }

  const totalPoints = Object.values(breakdown).reduce((sum, b) => sum + b.points, 0);
  const totalScore = Math.max(0, Math.min(100, score + totalPoints));

  return { totalScore, breakdown };
}
```

#### Stap 6: Candidate Filter Builder (`src/lib/candidate-filters.ts` — NIEUW)

```typescript
import { and, eq, inArray, sql, gte, isNull, isNotNull } from 'drizzle-orm';
import { kboCandidates } from './db/schema';
import type { ImportProfileFilters } from './types/import-profile';

export function buildCandidateFilters(filters: ImportProfileFilters) {
  const conditions = [eq(kboCandidates.status, 'pending')];

  if (filters.provinces?.length) {
    conditions.push(inArray(kboCandidates.province, filters.provinces));
  }

  if (filters.hasWebsite === true) {
    conditions.push(isNotNull(kboCandidates.website));
  } else if (filters.hasWebsite === false) {
    conditions.push(isNull(kboCandidates.website));
  }

  if (filters.minPreScore) {
    conditions.push(gte(kboCandidates.preScore, filters.minPreScore));
  }

  // NACE filtering via SQL LIKE
  if (filters.naceBlacklist?.length) {
    for (const prefix of filters.naceBlacklist) {
      conditions.push(
        sql`(${kboCandidates.naceCode} IS NULL OR ${kboCandidates.naceCode} NOT LIKE ${prefix + '%'})`
      );
    }
  }

  if (filters.legalFormExclude?.length) {
    for (const form of filters.legalFormExclude) {
      conditions.push(
        sql`(${kboCandidates.legalForm} IS NULL OR ${kboCandidates.legalForm} != ${form})`
      );
    }
  }

  return and(...conditions);
}
```

#### Stap 7: Smart Import API (`src/app/api/leads/smart-import/route.ts` — NIEUW)

```
GET  — Preview: hoeveel candidates beschikbaar (count + breakdown)
POST — Import N candidates → businesses tabel
       Body: { count: 50, profileId?: string }
       Response: { imported, duplicates, total, importLogId }
```

Flow voor POST:
1. Laad import profile filters (of default)
2. Query `kboCandidates` WHERE status='pending' + filters, ORDER BY preScore DESC, LIMIT count
3. Maak importLog entry (status='running')
4. Per candidate: INSERT in businesses met `onConflictDoUpdate` (zelfde pattern als /api/sync)
5. Bij nieuwe insert: maak leadStatuses + leadScores rows (zelfde als sync)
6. Markeer candidate als 'imported'
7. Update importLog naar 'completed'
8. Return resultaten

**BELANGRIJK:** Gebruik exact hetzelfde insert-pattern als `/api/sync/route.ts` — de `onConflictDoUpdate` op `(registryId, country)` met de `createdAt ≈ updatedAt` detectie voor insert vs update.

#### Stap 8: SmartImportButton (`src/components/leads/smart-import-button.tsx` — NIEUW)

Client component (`"use client"`) dat:
1. Bij mount: `GET /api/leads/smart-import` voor beschikbaar count
2. Toont knop: "Voeg 50 leads toe" met count badge
3. Bij klik: `POST /api/leads/smart-import` met `{ count: 50 }`
4. Loading state tijdens import
5. Na succes: `router.refresh()` + update count
6. Gebruik Lucide icons (Plus, Loader2, Database)

#### Stap 9: Integratie in Leads pagina

In `src/app/leads/page.tsx`, pas de Header actions aan:
```tsx
actions={
  <div className="flex items-center gap-2">
    <SmartImportButton />
    <a href={exportUrl}>
      <Button variant="secondary" size="sm">
        <Download className="h-4 w-4" /> CSV Export
      </Button>
    </a>
  </div>
}
```

#### Stap 10: Import Profiles CRUD

```
src/app/api/import-profiles/route.ts       — GET (list) + POST (create)
src/app/api/import-profiles/[id]/route.ts  — GET + PUT + DELETE
```

Seed een default profiel met alle NACE tier 1+2, blacklist, en rechtsvorm include/exclude.

#### Stap 11: KBO Staging Import Script (`scripts/kbo-staging-import.ts` — NIEUW)

Dit script vervangt het directe import naar businesses. Het hergebruikt de bestaande helpers uit `scripts/kbo-import.ts`:
- `isFlemishPostalCode()`, `deriveProvince()`, `convertDate()`, CSV streaming, lookup maps

Verschil: schrijft naar `kbo_candidates` tabel in plaats van POST naar `/api/sync`:
1. Stream-parse de 5 KBO CSVs (enterprise, denomination, address, contact, activity)
2. Filter: actieve status, Vlaamse postcodes, NACE niet in blacklist, rechtsvorm niet in exclude
3. Bereken preScore via `computePreScore()`
4. Batch insert (500 per batch) in `kbo_candidates` met `onConflictDoNothing` op registryId
5. Importeert `db` instance direct (niet via API) — gebruik dotenv voor DATABASE_URL

NPM script toevoegen: `"kbo-staging": "npx tsx scripts/kbo-staging-import.ts"`

---

### Fase 2: Pipeline & Outreach Tracking

#### Schema toevoegingen aan `src/lib/db/schema.ts`

```typescript
export const pipelineStageEnum = pgEnum('pipeline_stage', [
  'new', 'researching', 'contacted', 'replied', 'meeting_booked',
  'proposal_sent', 'negotiating', 'won', 'lost', 'not_qualified', 'nurture',
]);

export const outreachChannelEnum = pgEnum('outreach_channel', [
  'email', 'phone', 'linkedin', 'whatsapp', 'in_person',
]);

export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'urgent']);

export const leadPipeline = pgTable('lead_pipeline', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull().unique()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  stage: pipelineStageEnum('stage').notNull().default('new'),
  priority: priorityEnum('priority').notNull().default('medium'),
  dealValue: real('deal_value'),
  estimatedCloseDate: date('estimated_close_date'),
  nextFollowUpAt: timestamp('next_follow_up_at'),
  followUpNote: text('follow_up_note'),
  lastOutreachAt: timestamp('last_outreach_at'),
  outreachCount: integer('outreach_count').default(0).notNull(),
  stageChangedAt: timestamp('stage_changed_at').defaultNow().notNull(),
  lostReason: text('lost_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('lead_pipeline_stage_idx').on(table.stage),
  index('lead_pipeline_priority_idx').on(table.priority),
  index('lead_pipeline_next_follow_up_idx').on(table.nextFollowUpAt),
]);

export const outreachLog = pgTable('outreach_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  channel: outreachChannelEnum('channel').notNull(),
  subject: text('subject'),
  content: text('content'),
  outcome: text('outcome'),
  contactedAt: timestamp('contacted_at').defaultNow().notNull(),
  durationMinutes: integer('duration_minutes'),
  nextAction: text('next_action'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('outreach_log_business_idx').on(table.businessId),
  index('outreach_log_contacted_at_idx').on(table.contactedAt),
]);
```

**Relations toevoegen aan `businessesRelations`:**
```typescript
leadPipeline: one(leadPipeline, { fields: [businesses.id], references: [leadPipeline.businessId] }),
outreachLogs: many(outreachLog),
```

#### Constants toevoegen aan `src/lib/constants.ts`

```typescript
export const PIPELINE_STAGE_OPTIONS = [
  { value: 'new', label: 'Nieuw', color: 'bg-blue-100 text-blue-700' },
  { value: 'researching', label: 'Onderzoek', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'contacted', label: 'Gecontacteerd', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'replied', label: 'Gereageerd', color: 'bg-purple-100 text-purple-700' },
  { value: 'meeting_booked', label: 'Meeting Gepland', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'proposal_sent', label: 'Voorstel Verstuurd', color: 'bg-orange-100 text-orange-700' },
  { value: 'negotiating', label: 'Onderhandeling', color: 'bg-amber-100 text-amber-700' },
  { value: 'won', label: 'Gewonnen', color: 'bg-green-100 text-green-700' },
  { value: 'lost', label: 'Verloren', color: 'bg-red-100 text-red-700' },
  { value: 'not_qualified', label: 'Niet Gekwalificeerd', color: 'bg-gray-100 text-gray-700' },
  { value: 'nurture', label: 'Nurture', color: 'bg-teal-100 text-teal-700' },
] as const;

export const OUTREACH_CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email', icon: 'Mail' },
  { value: 'phone', label: 'Telefoon', icon: 'Phone' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'Linkedin' },
  { value: 'whatsapp', label: 'WhatsApp', icon: 'MessageCircle' },
  { value: 'in_person', label: 'Persoonlijk', icon: 'Users' },
] as const;

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Laag', color: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-600' },
  { value: 'high', label: 'Hoog', color: 'bg-orange-100 text-orange-600' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-600' },
] as const;
```

#### Pipeline Logic (`src/lib/pipeline-logic.ts` — NIEUW)

Auto-stage transitions:
- Eerste outreach gelogd + current stage='new' → auto naar 'contacted'
- Reply ontvangen → auto naar 'replied'
- Meeting geboekt → auto naar 'meeting_booked'
- Schrijf ook naar bestaande `statusHistory` tabel

#### API Routes

```
GET/POST  /api/pipeline              — Lijst + create pipeline entry
PATCH     /api/pipeline/[id]         — Stage/priority/dealValue update
GET/POST  /api/leads/[id]/outreach   — Outreach history + log nieuw
```

#### Kanban Board

**Installeer:** `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

**Components:**
- `src/components/pipeline/pipeline-board.tsx` — 'use client', DndContext, optimistic UI
- `src/components/pipeline/pipeline-column.tsx` — useDroppable, stage header met count
- `src/components/pipeline/pipeline-card.tsx` — useDraggable, hergebruik ScoreBadge

**Upgrade** `src/app/pipeline/page.tsx` — server component fetcht data, geeft aan client board

#### Outreach Components

- `src/components/outreach/outreach-timeline.tsx` — verticale timeline per channel icon
- `src/components/outreach/outreach-form.tsx` — 'use client', volgt AddNote pattern

Integreer op lead detail pagina (`src/app/leads/[id]/page.tsx`)

#### leadStatuses Migratie

Coexistentie-strategie:
- `lead_pipeline` naast `leadStatuses`
- Migratiescript: new→new, contacted→contacted, replied→replied, meeting→meeting_booked, won→won, lost→lost, disqualified→not_qualified
- PATCH endpoints synchroniseren beide tabellen

---

### Fase 3: Reminders & Templates

#### Schema toevoegingen

```typescript
export const reminderTypeEnum = pgEnum('reminder_type', [
  'follow_up', 'call', 'meeting_prep', 'check_in', 'custom',
]);

export const reminderStatusEnum = pgEnum('reminder_status', [
  'pending', 'completed', 'skipped',
]);

export const reminders = pgTable('reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  type: reminderTypeEnum('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: timestamp('due_date').notNull(),
  status: reminderStatusEnum('status').notNull().default('pending'),
  completedAt: timestamp('completed_at'),
  autoGenerated: boolean('auto_generated').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('reminders_due_date_idx').on(table.dueDate),
  index('reminders_business_idx').on(table.businessId),
  index('reminders_status_idx').on(table.status),
]);

export const outreachTemplates = pgTable('outreach_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  channel: outreachChannelEnum('channel').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  variables: jsonb('variables').default(sql`'[]'::jsonb`),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

#### API Routes

```
GET/POST   /api/reminders             — Lijst + aanmaken
PATCH/DEL  /api/reminders/[id]        — Complete/skip/verwijder
GET        /api/reminders/due         — Bearer auth (n8n), vandaag's due reminders
GET/POST   /api/outreach-templates    — CRUD
GET/PATCH/DEL /api/outreach-templates/[id]
```

#### Auto-Suggest Reminders (`src/lib/auto-reminders.ts`)

Na outreach logging:
- Email → auto reminder +3 dagen
- Telefoon geen antwoord → +2 dagen
- "Interested" reply → +1 dag meeting inplannen
- Stage → proposal_sent → +5 dagen offerte opvolgen

#### Template Variabelen (`src/lib/templates.ts`)

```
{{bedrijfsnaam}} → business.name
{{stad}} → business.city
{{nace_sector}} → NACE description
{{website}} → business.website
{{postcode}} → business.postalCode
{{score}} → leadScores.totalScore
```

#### Reminder Components

- `src/components/reminders/reminder-list.tsx`
- `src/components/reminders/reminder-form.tsx`
- `src/components/reminders/reminder-badge.tsx` — overdue count in sidebar

**Sidebar uitbreiding:** voeg "Reminders" nav item toe met badge.

#### Dashboard Stats

Uitbreid `GET /api/stats` met: pipeline funnel counts, conversion rates, pool status, reminder counts.

---

## Implementatievolgorde

1. Schema: Fase 1 enums + tabellen → `schema.ts` → `drizzle-kit generate` + `push`
2. `src/lib/nace-config.ts`
3. `src/lib/types/import-profile.ts`
4. `src/lib/pre-scoring.ts`
5. `src/lib/candidate-filters.ts`
6. `scripts/kbo-staging-import.ts`
7. `src/app/api/import-profiles/` routes
8. `src/app/api/leads/smart-import/route.ts`
9. `src/components/leads/smart-import-button.tsx` → integreer in leads pagina
10. Schema: Fase 2 enums + tabellen → `drizzle-kit generate` + `push`
11. Pipeline constants + `src/lib/pipeline-logic.ts`
12. `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
13. Pipeline API routes + Kanban components
14. Outreach API + components
15. leadStatuses → lead_pipeline migratiescript
16. Schema: Fase 3 tabellen → `drizzle-kit generate` + `push`
17. Reminder API routes + components + sidebar badge
18. Template API + variabelen systeem
19. Auto-suggest reminders
20. Dashboard stats uitbreiding

## Verificatie

1. `npx tsx scripts/kbo-staging-import.ts ./kbo-data --limit 1000` — candidates tabel gevuld
2. `POST /api/leads/smart-import { count: 10 }` — 10 leads aangemaakt
3. Herhaal stap 2 — geen duplicaten
4. `/leads` pagina — smart import button werkt + count badge
5. `/pipeline` — kanban met drag-and-drop
6. Lead detail — outreach timeline + form
7. Reminders — badge in sidebar, due list
8. `npm run build` — geen errors
