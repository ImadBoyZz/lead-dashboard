# Claude Managed Agents Integratie — Lead Dashboard

## Wat je moet bouwen

Bouw de infrastructuur in het bestaande lead-dashboard project (Next.js 16, Drizzle ORM, Neon Postgres) zodat een Claude Managed Agent (platform.claude.com) de sales pipeline kan analyseren en acties kan ondernemen. Dit is de "agent backend" — de endpoints en database structuur die de externe Managed Agent aanroept via tools.

**Dit is GEEN chatbot of conversational UI.** Je bouwt:
1. Twee API endpoints die de Managed Agent als tools gebruikt
2. Een event log tabel die elke agent-beslissing vastlegt
3. Een `author` kolom op de notes tabel zodat agent-notities visueel onderscheiden zijn
4. UI aanpassing: agent notes tonen met een "AI" badge op de lead detail pagina

---

## Stap 0: Oriëntatie

Lees eerst deze bestanden om het project te begrijpen:
1. `src/lib/db/schema.ts` — Database schema (Drizzle ORM). Let op: hoe tabellen, enums, indexes en relations gedefinieerd zijn.
2. `src/lib/env.ts` — Env var validatie patroon
3. `src/lib/auth.ts` — Auth patroon: `isValidSession(request)` controleert cookie. De agent endpoints gebruiken een ANDER patroon: Bearer token auth.
4. `src/app/api/leads/[id]/outreach/route.ts` — Voorbeeld API route: Next.js 16 params pattern (`params: Promise<{ id: string }>`), Zod validatie, error handling
5. `src/lib/rate-limit.ts` — Rate limiting patroon
6. `src/types/index.ts` — TypeScript type exports
7. `src/app/leads/[id]/page.tsx` — Lead detail pagina, specifiek de "Notities" sectie

Begrijp de bestaande patronen en volg deze exact.

---

## Stap 1: Env var toevoegen

**In `src/lib/env.ts`**, voeg toe aan het env object:
```typescript
AGENT_WEBHOOK_SECRET: process.env.AGENT_WEBHOOK_SECRET ?? '',
```

Dit is de Bearer token waarmee de Managed Agent (via n8n) zich authenticeert bij de agent endpoints. Optioneel, zelfde patroon als `N8N_WEBHOOK_SECRET`.

---

## Stap 2: Database Schema

### Nieuwe tabel: `agentActions`

Voeg toe aan `src/lib/db/schema.ts` (na de bestaande AI tabellen, voor de relations):

```
id              uuid PK defaultRandom
businessId      uuid FK → businesses.id CASCADE
triggeredAt     timestamp defaultNow
inputSnapshot   jsonb (exacte lead context die agent zag)
decision        text not null ('stage_change' | 'score_update' | 'no_action')
previousStage   text nullable
newStage        text nullable
note            text nullable
reasoning       text not null (agent's redenering in het Nederlands)
latencyMs       integer
modelVersion    text not null (bijv. 'claude-sonnet-4-6')
createdAt       timestamp defaultNow
```

Indexes: `businessId`, `decision`, `createdAt`

### Kolom toevoegen aan `notes` tabel

Voeg een `author` kolom toe:
```typescript
author: text('author').default('human').notNull(), // 'human' | 'agent'
```

### Relations toevoegen

- `businesses` → `many(agentActions)`
- `agentActions` → `one(businesses)`

### Types updaten in `src/types/index.ts`

Voeg toe:
```typescript
export type AgentAction = typeof schema.agentActions.$inferSelect;
export type NewAgentAction = typeof schema.agentActions.$inferInsert;
```

### Migratie

Na schema wijzigingen: `npx drizzle-kit push --force`

---

## Stap 3: Agent API Endpoints

### Auth helper

Maak `src/lib/agent-auth.ts`:
```typescript
// Bearer token auth voor agent/n8n endpoints
// Patroon: Authorization header met "Bearer <AGENT_WEBHOOK_SECRET>"
// Vergelijkbaar met hoe N8N_WEBHOOK_SECRET werkt in andere routes

import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export function isValidAgentToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === env.AGENT_WEBHOOK_SECRET && token !== '';
}
```

### Endpoint 1: `GET /api/agent/leads/snapshot`

**Bestand:** `src/app/api/agent/leads/snapshot/route.ts`

```
Auth: Bearer token via isValidAgentToken()
Rate limit: 30 calls/min (key: 'agent-snapshot')

Logica:
1. Valideer auth
2. Query alle actieve leads (niet frozen, niet won/ignored) met:
   - business: id, name, naceCode, naceDescription, sector, city, province, website, leadTemperature, email, phone
   - leadScore: totalScore, maturityCluster, scoreBreakdown
   - leadPipeline: stage, priority, lastOutreachAt, outreachCount, nextFollowUpAt, dealValue
   - leadStatus: status, contactedAt, repliedAt, meetingAt
3. LEFT JOIN businesses → leadScores, leadPipeline, leadStatuses
4. Filter: leadPipeline.frozen = false AND stage NOT IN ('won', 'ignored')
5. Order by leadScores.totalScore DESC
6. Return JSON array

Geen Zod nodig (GET, geen body).
```

### Endpoint 2: `POST /api/agent/leads/[id]/stage`

**Bestand:** `src/app/api/agent/leads/[id]/stage/route.ts`

```
Auth: Bearer token via isValidAgentToken()
Rate limit: 20 calls/min (key: 'agent-stage')
maxDuration = 15 (export const maxDuration = 15)

Input (Zod validated):
{
  newStage: enum('new', 'contacted', 'quote_sent', 'meeting', 'won', 'ignored')
  note: string (max 1000, de notitie die op de lead detail verschijnt)
  reasoning: string (max 2000, agent's interne redenering)
  modelVersion: string (max 100)
  latencyMs: number (integer, optional)
  inputSnapshot: object (optional, de data die agent zag)
}

Logica:
1. Valideer auth + Zod
2. Fetch huidige pipeline stage: db.query.leadPipeline.findFirst({ where: eq(businessId, id) })
3. Als pipeline niet bestaat → 404
4. CONSTRAINT: newStage mag NIET 'won' zijn (dat is alleen menselijk). Return 403 als poging.
5. Update leadPipeline: stage, stageChangedAt = new Date(), updatedAt = new Date()
6. Insert in agentActions: businessId, decision='stage_change', previousStage, newStage, note, reasoning, modelVersion, latencyMs, inputSnapshot
7. Insert in notes: businessId, content=note, author='agent'
8. Insert in statusHistory: businessId, fromStatus=previousStage, toStatus=newStage
9. Return { success: true, previousStage, newStage }

Error handling: try/catch met console.error + 500 response (zelfde patroon als andere routes)
```

### Endpoint 3: `POST /api/agent/leads/[id]/analyze`

**Bestand:** `src/app/api/agent/leads/[id]/analyze/route.ts`

```
Auth: Bearer token
Rate limit: 20 calls/min

Input (Zod):
{
  note: string (max 1000)
  reasoning: string (max 2000)
  modelVersion: string
  latencyMs: number (optional)
  inputSnapshot: object (optional)
}

Logica:
1. Valideer auth + Zod
2. Insert in agentActions: decision='no_action', note, reasoning, etc.
3. Insert in notes: content=note, author='agent'
4. Return { success: true }

Dit endpoint is voor wanneer de agent een lead analyseert maar GEEN stage change doet.
Alleen een notitie + log.
```

---

## Stap 4: UI Aanpassing — Agent Notes Badge

### In `src/app/leads/[id]/page.tsx`

De notes query haalt al alle notes op. Na de `author` kolom toevoeging bevat elke note een `author` veld.

Pas de Notities rendering aan:

**Huidige code (zoek naar de `.map((note)` in de Notities Card):**
```tsx
{leadNotes.map((note) => (
  <div key={note.id} className="border-l-2 border-accent/30 pl-3 py-1 flex items-start gap-2">
    <div className="flex-1 min-w-0">
      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
      <p className="text-xs text-muted mt-1">{formatDate(note.createdAt)}</p>
    </div>
    <DeleteNoteButton noteId={note.id} />
  </div>
))}
```

**Nieuwe code:**
```tsx
{leadNotes.map((note) => (
  <div key={note.id} className={`border-l-2 pl-3 py-1 flex items-start gap-2 ${note.author === 'agent' ? 'border-purple-400 bg-purple-50/50' : 'border-accent/30'}`}>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        {note.author === 'agent' && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
            AI
          </span>
        )}
        <p className="text-xs text-muted">{formatDate(note.createdAt)}</p>
      </div>
      <p className="text-sm whitespace-pre-wrap mt-1">{note.content}</p>
    </div>
    {note.author !== 'agent' && <DeleteNoteButton noteId={note.id} />}
  </div>
))}
```

Wijzigingen:
- Agent notes krijgen een paarse linker border + lichte achtergrond
- "AI" badge boven de notitie
- Agent notes hebben GEEN delete knop (ze zijn onderdeel van de audit trail)

---

## Bouwvolgorde (EXACT deze volgorde)

1. **Env var** — AGENT_WEBHOOK_SECRET toevoegen
2. **Schema** — agentActions tabel + author kolom op notes + relations + types
3. **Migratie** — `npx drizzle-kit push --force`
4. **Agent auth helper** — `src/lib/agent-auth.ts`
5. **API endpoints** — snapshot, stage, analyze (alle drie)
6. **UI** — Agent notes badge op lead detail pagina
7. **Build check** — `npm run build` moet slagen

---

## Verificatie checklist

- [ ] `npx drizzle-kit push --force` slaagt zonder errors
- [ ] `npm run build` slaagt
- [ ] GET /api/agent/leads/snapshot met juiste Bearer token → JSON array met leads
- [ ] GET /api/agent/leads/snapshot zonder token → 401
- [ ] POST /api/agent/leads/[id]/stage met valid data → stage updated + note + agentAction aangemaakt
- [ ] POST /api/agent/leads/[id]/stage met newStage='won' → 403
- [ ] POST /api/agent/leads/[id]/analyze → no_action log + note aangemaakt
- [ ] Lead detail pagina: agent notes tonen paarse "AI" badge, geen delete knop
- [ ] Human notes tonen normaal met delete knop

---

## BELANGRIJK: Regels

1. **Lees bestaande code eerst** — begrijp patronen voordat je schrijft
2. **Volg bestaande patronen exact** — API route structuur (Next.js 16 params Promise pattern), Zod validatie, error handling, schema definitie stijl
3. **Maak ALLEEN de gevraagde wijzigingen** — geen extra features, geen refactoring
4. **Nederlands** — alle error messages en comments in het Nederlands
5. **Geen overflow-x: hidden** op parents van sticky elementen
6. **Lucide Icons** gebruiken (bestaande icon library)
7. **Bearer token auth** voor agent endpoints, NIET cookie auth (de Managed Agent heeft geen browser sessie)
