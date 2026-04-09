# AI & Automatisering Upgrade — Lead Dashboard

## Wat je moet bouwen

Bouw 4 AI-features in het bestaande lead-dashboard project (Next.js 16, Drizzle ORM, Neon Postgres). Het dashboard is een interne sales tool voor een web agency (Averis Solutions) die KMO's in België/Nederland target. Het is actief in gebruik met echte leads.

**Alle berichten moeten in het Nederlands zijn.** Toon verschilt per sector (formeel voor advocaten/medisch, informeel voor horeca/bouw).

**Ondersteun zowel Claude (Anthropic) als OpenAI** via een abstractie layer. Gebruiker kiest provider via env var.

---

## Stap 0: Oriëntatie

Lees eerst deze bestanden om het project te begrijpen:
1. `src/lib/db/schema.ts` — Volledige database schema (Drizzle ORM)
2. `src/lib/scoring.ts` — 6-dimensionaal lead scoring systeem
3. `src/lib/auto-reminders.ts` — Huidige auto-reminder logica (hardcoded timing)
4. `src/lib/pipeline-logic.ts` — Pipeline stage management
5. `src/components/outreach/outreach-form.tsx` — Outreach formulier (integratiepunt)
6. `src/components/outreach/outreach-timeline.tsx` — Outreach history weergave
7. `src/app/api/leads/[id]/outreach/route.ts` — Outreach logging API
8. `src/lib/nace-config.ts` — Sector configuratie (NACE codes → tiers)
9. `src/lib/rate-limit.ts` — Rate limiting patroon
10. `src/lib/env.ts` — Env var validatie
11. `src/types/index.ts` — TypeScript interfaces
12. `src/app/leads/page.tsx` — Leads lijst pagina
13. `src/app/leads/[id]/page.tsx` — Lead detail pagina
14. `src/app/page.tsx` — Dashboard pagina

Begrijp de bestaande patronen (API route structuur, Zod validatie, Next.js 16 params pattern, component organisatie) en volg deze exact.

---

## Stap 1: Foundation — AI Provider Abstractie

### Dependencies installeren
```bash
npm install @anthropic-ai/sdk openai
```

### Env vars toevoegen aan `src/lib/env.ts`
- `AI_PROVIDER` — `'anthropic' | 'openai'` (default: `'anthropic'`), optioneel
- `ANTHROPIC_API_KEY` — optioneel (required als provider = anthropic)
- `OPENAI_API_KEY` — optioneel (required als provider = openai)

### Nieuwe bestanden aanmaken

**`src/lib/ai/provider.ts`** — AI Provider abstractie
```typescript
// Interface:
interface AIProvider {
  generateText(systemPrompt: string, userPrompt: string, options?: {
    maxTokens?: number;
    temperature?: number;
  }): Promise<{
    text: string;
    usage: { promptTokens: number; completionTokens: number };
  }>;
}

// Twee implementaties: AnthropicProvider (gebruikt @anthropic-ai/sdk) en OpenAIProvider (gebruikt openai)
// Factory functie: getAIProvider() leest AI_PROVIDER env var en returned juiste implementatie
// AnthropicProvider gebruikt claude-sonnet-4-20250514 als default model
// OpenAIProvider gebruikt gpt-4o als default model
```

**`src/lib/ai/tone.ts`** — Sector → toon mapping
```typescript
// Bepaal toon op basis van NACE code prefix (volg patroon van nace-config.ts):
// Formeel: 691 (advocaten), 862 (medisch/tandarts), 711 (architecten), 68 (vastgoed), 69 (boekhouders)
// Informeel: 56 (horeca), 47 (retail), 9602 (beauty/kapper), 43 (bouw/installateurs), 8130 (tuinaanleg), 45 (autohandel)
// Semi-formeel: alles anders (default)
// Export: getToneForNace(naceCode: string): 'formal' | 'informal' | 'semi-formal'
```

**`src/lib/ai/prompts.ts`** — Prompt templates
```typescript
// Functies die context accepteren en { system, user } prompt paren returnen.
// Alle prompts instrueren AI om ALLEEN in het Nederlands te antwoorden.
// Toon-instructie (formeel/informeel) wordt meegegeven.

// 1. generateOutreachPrompt(context: OutreachContext): { system, user }
//    Context bevat: bedrijfsnaam, sector, stad, naceDescription, website,
//    auditFindings (PageSpeed, SSL, CMS, analytics), scoreBreakdown (6 dimensies),
//    eerdereOutreach (kanaal+uitkomst), toon, kanaal (email/phone)
//    Instructie: genereer 3 varianten als JSON array [{subject, body}]
//    Voor telefoon: geen subject, body = gesprekscript

// 2. generateFollowUpPrompt(context: FollowUpContext): { system, user }
//    Context bevat: laatste outreach (kanaal, inhoud, uitkomst), bedrijfsinfo,
//    alle eerdere outreach, sector, leadTemperature, outreachCount
//    Instructie: suggereer volgende actie als JSON {suggestedAction, suggestedChannel, suggestedDays, draftMessage, reasoning}

// 3. generateInsightsPrompt(data: InsightsData): { system, user }
//    Data bevat: geaggregeerde conversion rates per sector+kanaal, top templates,
//    rejection reason verdeling
//    Instructie: genereer 3-5 Nederlandse inzichten als JSON [{pattern, metric, recommendation}]
```

**`src/lib/ai/cost-tracker.ts`** — Token usage logging
```typescript
// logAIUsage(params: { endpoint, aiProvider, aiModel, promptTokens, completionTokens, businessId?, campaignId? })
// Insert in ai_usage_log tabel
// Bereken costEstimate op basis van bekende token prijzen
```

### Database migraties

Voeg toe aan `src/lib/db/schema.ts`:

**Nieuwe enum:**
```typescript
export const draftStatusEnum = pgEnum('draft_status', ['pending', 'approved', 'rejected', 'sent']);
```

**Nieuwe tabel: `outreachDrafts`**
```
id              uuid PK defaultRandom
businessId      uuid FK → businesses.id CASCADE
campaignId      uuid nullable (groepeert batch drafts)
channel         outreachChannelEnum
subject         text nullable
body            text not null
tone            text ('formal' | 'informal' | 'semi-formal')
status          draftStatusEnum default 'pending'
aiProvider      text
aiModel         text
promptTokens    integer default 0
completionTokens integer default 0
variantIndex    integer (0, 1, 2)
selectedVariant boolean default false
templateId      uuid nullable FK → outreachTemplates.id
createdAt       timestamp defaultNow
updatedAt       timestamp defaultNow
```

**Nieuwe tabel: `scoringFeedback`**
```
id              uuid PK defaultRandom
businessId      uuid FK → businesses.id CASCADE
channel         outreachChannelEnum
templateId      uuid nullable FK → outreachTemplates.id
outcome         text (de structuredOutcome waarde)
naceCode        text nullable
sector          text nullable
maturityCluster text nullable
totalScore      integer
scoreBreakdown  jsonb
outreachCount   integer
leadTemperature text
conversionSuccess boolean
createdAt       timestamp defaultNow
```

**Nieuwe tabel: `aiUsageLog`**
```
id              uuid PK defaultRandom
endpoint        text
aiProvider      text
aiModel         text
promptTokens    integer
completionTokens integer
totalTokens     integer
costEstimate    real
businessId      uuid nullable
campaignId      uuid nullable
createdAt       timestamp defaultNow
```

**Kolom toevoegingen aan bestaande tabellen:**
- `outreachLog`: + `aiGenerated` boolean default false
- `outreachLog`: + `draftId` uuid nullable FK → outreachDrafts.id
- `reminders`: + `suggestedMessage` text nullable

**Relations toevoegen** in schema.ts (volg bestaand patroon):
- businesses → many(outreachDrafts), many(scoringFeedback)
- outreachDrafts → one(businesses)
- scoringFeedback → one(businesses)

Na schema wijzigingen: `npm run db:generate && npm run db:push`

---

## Stap 2: Feature 1 — AI Outreach Message Generator

### API Route: `POST /api/ai/generate/route.ts`

```
Input (Zod validated):
{
  businessId: string (uuid)
  channel: 'email' | 'phone'
  templateId?: string (uuid, optioneel)
}

Logica:
1. Fetch business + audit + leadScore + outreachLog (laatste 5) + template (indien templateId)
2. Bepaal toon via getToneForNace(business.naceCode)
3. Bouw context object voor generateOutreachPrompt()
4. Call getAIProvider().generateText() met prompt
5. Parse AI response als JSON: [{subject, body}, {subject, body}, {subject, body}]
6. Log usage via cost-tracker
7. Return { variants: [{subject, body, tone, variantIndex: 0|1|2}], usage }

Rate limit: 10 calls/min (gebruik bestaand rateLimit() patroon)
Auth: check session (bestaand auth patroon)
```

### Componenten

**`src/components/ai/generate-button.tsx`** (client component)
- Props: `businessId: string, channel: string, templateId?: string`
- State: loading, error
- onClick: POST naar /api/ai/generate → open VariantSelector modal
- Knoptekst: "Genereer Concept"
- Styling: volg bestaande Button component stijl, voeg een sparkle/wand icoon toe (Lucide)

**`src/components/ai/variant-selector.tsx`** (client component)
- Props: `variants: Variant[], onSelect: (variant) => void, onClose: () => void`
- Toont 3 kaarten naast elkaar (of gestapeld op mobile)
- Elke kaart: subject (bold) + body preview (truncated)
- Klik op kaart → selecteer → onSelect callback
- Styling: modale overlay, kaarten met hover effect, geselecteerde kaart heeft border accent

### Integratie in `outreach-form.tsx`
- Voeg "Genereer Concept" knop toe naast de kanaal selector
- Wanneer variant geselecteerd: vul subject + content textarea in met de variant data
- Voeg hidden field `aiGenerated: true` toe aan form submission
- De bestaande submit flow blijft ongewijzigd — het logt gewoon naar outreachLog met de extra aiGenerated flag

### Wijziging in `POST /api/leads/[id]/outreach/route.ts`
- Accepteer optionele `aiGenerated: boolean` in request body
- Sla op in outreachLog record

---

## Stap 3: Feature 2 — Smart Follow-Up Suggesties

### API Routes

**`POST /api/ai/follow-up/[id]/route.ts`** (`[id]` = outreachLog id)
```
Input: geen body nodig, id uit params

Logica:
1. Fetch outreachLog entry by id
2. Fetch business + leadScore + leadPipeline + alle outreachLog voor dit bedrijf
3. Bepaal toon via NACE
4. Bouw context voor generateFollowUpPrompt()
5. Call AI provider
6. Parse response: {suggestedAction, suggestedChannel, suggestedDays, draftMessage, reasoning}
7. Return suggestie

Auth: check session
```

**`POST /api/ai/follow-up/[id]/accept/route.ts`**
```
Input body (Zod):
{
  suggestedChannel: string
  suggestedDays: number
  draftMessage: string
}

Logica:
1. Bereken dueDate = now + suggestedDays dagen
2. Maak reminder aan (type: 'follow_up', title: suggestedAction, dueDate, suggestedMessage: draftMessage)
3. Update leadPipeline.nextFollowUpAt = dueDate
4. Return success

Auth: check session
```

### Component

**`src/components/ai/follow-up-card.tsx`** (client component)
- Props: `outreachLogId: string, businessId: string`
- State: suggestion (null initially), loading, accepted
- "Suggestie ophalen" knop → POST naar /api/ai/follow-up/[id]
- Toont kaart met:
  - Icoon voor kanaal (email/telefoon/linkedin)
  - "Bel terug over 3 dagen" (actie + timing)
  - Concept bericht (collapsible)
  - Redenering (klein, grijs)
  - "Accepteer" knop → POST naar accept endpoint
- Na accepteer: kaart wordt groen met "Reminder aangemaakt ✓"

### Integratie

**In `outreach-form.tsx` of lead detail page:**
- Na succesvolle outreach submit met een `structuredOutcome`:
  - Toon `<FollowUpCard>` onder het formulier
  - Card haalt automatisch suggestie op

**In `outreach-timeline.tsx`:**
- Bij elke timeline entry die een outcome heeft:
  - Toon kleine "AI suggestie" link
  - Klik → toont FollowUpCard inline

**`src/lib/auto-reminders.ts` aanpassing:**
- De bestaande `createAutoReminder()` functie blijft ongewijzigd als fallback
- De follow-up accept endpoint gebruikt zijn eigen reminder creation (niet de auto-reminder functie)
- Zo is er geen breaking change in bestaande flow

---

## Stap 4: Feature 3 — Batch Outreach Generatie

### API Routes

**`POST /api/ai/generate/batch/route.ts`**
```
Input (Zod):
{
  businessIds: string[] (max 20)
  channel: 'email' | 'phone'
  templateStyle?: string
}

Logica:
1. Genereer campaignId (uuid)
2. Voor elke businessId (SEQUENTIEEL, niet parallel — rate limits):
   a. Fetch business + audit + score
   b. Bepaal toon
   c. Genereer 1 variant via AI (niet 3 — te duur voor batch)
   d. Sla op in outreachDrafts tabel (status: 'pending', campaignId)
3. Log totale usage
4. Return { campaignId, count, totalUsage }

Rate limit: 3 batch calls/uur
Max 20 leads per batch
```

**`GET /api/ai/drafts/route.ts`**
```
Query params: campaignId (required)
Returns: alle drafts voor campaign, JOIN met businesses (naam, sector, stad)
Sorted by: businesses.name
```

**`PATCH /api/ai/drafts/[id]/route.ts`**
```
Input (Zod):
{
  status?: 'approved' | 'rejected'
  body?: string (inline edit)
  subject?: string (inline edit)
}
Updates de draft record
```

**`POST /api/ai/drafts/bulk-approve/route.ts`**
```
Input (Zod):
{
  draftIds: string[] (alleen drafts met status 'approved')
}

Logica:
1. Fetch alle approved drafts
2. Voor elke draft:
   a. Insert outreachLog record (channel, subject, content=body, aiGenerated=true, draftId)
   b. Call bestaande autoTransitionOnOutreach() uit pipeline-logic.ts
   c. Call bestaande createAutoReminder() uit auto-reminders.ts
   d. Update draft status → 'sent'
3. Return { count: number }
```

### Componenten

**`src/components/leads/leads-selection-provider.tsx`** (client component)
- React Context: `{ selectedIds: Set<string>, toggle: (id) => void, selectAll: () => void, clearAll: () => void, count: number }`
- Wrap de leads pagina content

**`src/components/leads/lead-checkbox.tsx`** (client component)
- Props: `leadId: string`
- Gebruikt SelectionContext
- Checkbox die toggle() aanroept

**`src/components/ai/batch-toolbar.tsx`** (client component)
- Fixed aan onderkant van scherm (position: fixed, bottom: 0)
- Toont: "{count} leads geselecteerd" + kanaal dropdown + "Genereer Outreach" knop
- Verschijnt alleen als count > 0 (animatie: slide up)
- onClick: POST naar batch generate → redirect naar approval board

**`src/components/ai/draft-approval-board.tsx`** (client component)
- Haalt drafts op via GET /api/ai/drafts?campaignId=xxx
- Grid van DraftCards
- Top bar: "Alles goedkeuren" / "Alles afwijzen" / "Verstuur goedgekeurd ({count})"
- "Verstuur" knop: POST naar bulk-approve met approved draft IDs

**`src/components/ai/draft-card.tsx`** (client component)
- Props: `draft: OutreachDraft & { business: { name, sector, city } }`
- Toont: bedrijfsnaam (bold), sector badge, subject, body (textarea voor edit)
- Knoppen: "Goedkeuren" (groen) / "Afwijzen" (rood)
- Status indicator: pending (geel) / approved (groen) / rejected (rood doorgestreept)

### Nieuwe pagina

**`src/app/leads/batch/[campaignId]/page.tsx`** (server component)
- Haalt campaignId uit params
- Rendered `<DraftApprovalBoard campaignId={campaignId} />`
- Breadcrumb: Leads → Batch Outreach → Campaign

### Integratie in `src/app/leads/page.tsx`
- Wrap content in `<LeadsSelectionProvider>`
- Voeg checkbox kolom toe aan leads tabel (eerste kolom)
- Header checkbox = select all (op huidige pagina)
- Voeg `<BatchToolbar />` toe aan pagina (buiten tabel)

---

## Stap 5: Feature 4 — Outcome Feedback Loop

### Wijziging in bestaande outreach route

**`src/app/api/leads/[id]/outreach/route.ts`** — na succesvolle outreach insert:
```typescript
// Als er een structuredOutcome is, sla snapshot op in scoringFeedback:
if (structuredOutcome) {
  // Fetch huidige leadScore + business data
  const score = await db.query.leadScores.findFirst({ where: eq(leadScores.businessId, businessId) });
  const business = await db.query.businesses.findFirst({ where: eq(businesses.id, businessId) });
  const pipeline = await db.query.leadPipeline.findFirst({ where: eq(leadPipeline.businessId, businessId) });
  
  await db.insert(scoringFeedback).values({
    businessId,
    channel,
    templateId: templateId || null,
    outcome: structuredOutcome,
    naceCode: business?.naceCode,
    sector: business?.sector,
    maturityCluster: score?.maturityCluster,
    totalScore: score?.totalScore || 0,
    scoreBreakdown: score?.scoreBreakdown || {},
    outreachCount: pipeline?.outreachCount || 0,
    leadTemperature: business?.leadTemperature || 'cold',
    conversionSuccess: ['interested', 'meeting_booked', 'callback_requested'].includes(structuredOutcome),
  });
}
```

### API Routes

**`POST /api/ai/insights/route.ts`**
```
Logica:
1. Query scoringFeedback: groepeer per sector + channel
2. Bereken conversion rates: (conversionSuccess=true / total) per groep
3. Vind top templates (meeste positieve outcomes)
4. Vind rejection reason verdeling
5. Stuur geaggregeerde data naar AI via generateInsightsPrompt()
6. Parse response: [{pattern, metric, recommendation}]
7. Return insights

Minimum data: returneer lege array als < 10 feedback records
```

**`GET /api/ai/insights/route.ts`**
```
Simpele versie: trigger POST logica on-demand (geen caching nodig voor v1)
Of: cache in een aparte insights tabel/kolom (optioneel)
```

### Component

**`src/components/ai/insights-widget.tsx`** (client component)
- Haalt insights op via GET /api/ai/insights
- Card met titel "Outreach Inzichten"
- Lijst van 3-5 patronen:
  - Icoon (trending up/down)
  - Pattern tekst (bold): "Bouw sector via telefoon"
  - Metric: "42% conversie vs 12% gemiddeld"
  - Recommendation: "Focus op telefonisch contact voor bouwbedrijven"
- "Ververs" knop om POST te triggeren
- Empty state als < 10 feedback records: "Nog niet genoeg data. Log meer outreach resultaten."

### Integratie in `src/app/page.tsx` (dashboard)
- Voeg `<InsightsWidget />` toe aan het dashboard (onder of naast bestaande stats)

---

## Bouwvolgorde (EXACT deze volgorde)

1. **Foundation** (Stap 1): provider.ts, tone.ts, prompts.ts, cost-tracker.ts, schema migratie
2. **AI Message Generator** (Stap 2): /api/ai/generate, components, outreach-form integratie
3. **Smart Follow-Ups** (Stap 3): /api/ai/follow-up, component, timeline integratie
4. **Batch Generatie** (Stap 4): /api/ai/generate/batch, drafts CRUD, approval board, leads page
5. **Feedback Loop** (Stap 5): outreach route wijziging, /api/ai/insights, widget

Test elke feature na het bouwen voordat je doorgaat naar de volgende.

---

## Verificatie checklist

Na elke feature, test:

### Feature 1:
- [ ] Open lead detail met audit data → "Genereer Concept" knop zichtbaar
- [ ] Klik → 3 Nederlandse varianten verschijnen in modal
- [ ] Toon klopt (formeel voor medisch, informeel voor bouw)
- [ ] Selecteer variant → form velden ingevuld
- [ ] Submit → outreach_log heeft aiGenerated=true
- [ ] ai_usage_log heeft entry met tokens

### Feature 2:
- [ ] Log outreach met outcome → follow-up kaart verschijnt
- [ ] "Suggestie ophalen" → toont kanaal, timing, concept bericht
- [ ] "Accepteer" → reminder aangemaakt, nextFollowUpAt updated
- [ ] Bestaande auto-reminder flow werkt nog (geen breaking change)

### Feature 3:
- [ ] Leads pagina: checkboxes zichtbaar
- [ ] Selecteer 3+ leads → floating toolbar verschijnt
- [ ] "Genereer" → redirect naar approval board met drafts
- [ ] Inline edit werkt, approve/reject werkt
- [ ] "Verstuur goedgekeurd" → outreach_log entries + reminders aangemaakt

### Feature 4:
- [ ] Log 10+ outreach met outcomes → POST /api/ai/insights returnt data
- [ ] Dashboard widget toont patronen in het Nederlands
- [ ] scoring_feedback tabel bevat snapshots van elke outcome

### Cross-cutting:
- [ ] Wissel AI_PROVIDER env var → generatie werkt met beide providers
- [ ] Rate limiting werkt (te veel calls → 429 response)
- [ ] Alle AI calls zijn server-side (check Network tab)

---

## BELANGRIJK: Regels

1. **Lees bestaande code eerst** — begrijp patronen voordat je schrijft
2. **Volg bestaande patronen exact** — API route structuur, Zod validatie, component stijl, error handling
3. **Maak ALLEEN de gevraagde wijzigingen** — geen extra features, geen refactoring van bestaande code
4. **Test na elke feature** — niet alles tegelijk bouwen
5. **Nederlands** — alle AI output, UI tekst, en comments in het Nederlands
6. **Geen overflow-x: hidden** op parents van sticky elementen
7. **Lucide Icons** gebruiken (bestaande icon library in dit project)
