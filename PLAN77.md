# Transitieplan: KBO weg → Google Places API als enige leadbron

## Context

Het KBO-based lead systeem levert consequent verkeerde leads (advocaten/notarissen ipv kappers/garages). Beslissing: **alles KBO-gerelateerd weggooien**, fresh start, Google Places API als enige bron. Dashboard vereenvoudigen tot wat Imad daadwerkelijk nodig heeft om te bellen en deals te sluiten.

## Uitgangspunten (uit brainstorm)

- **Enige bron:** Google Places API (Text Search) — geen Playwright scraper
- **Budget:** €10/maand (~580 API calls). 90% discovery, 10% re-enrichment
- **Outreach:** Mix (telefoon + email + LinkedIn)
- **Database:** Fresh start — alle bestaande leads + kboCandidates wissen
- **UI:** Simpel — leadlijst met score + detail pagina + 5-staps pipeline (Nieuw→Gecontacteerd→Afspraak→Gewonnen→Genegeerd)
- **Regio:** Heel Vlaanderen
- **Import:** Handmatig via UI, sector + stad kiezen, per 25 leads, alleen kwalitatief (actief, reviews, niet gesloten)
- **Kwaliteitsfilter:** Bedrijf moet actief zijn op Google (reviews > 0) + niet permanent gesloten

## Volledige sectorlijst

```
BEAUTY & WELLNESS: kapper, schoonheidssalon, nagelstudio, barbershop, wellness/spa/sauna, yoga studio
HORECA: restaurant, cafe/bar, traiteur/catering, bakkerij, foodtruck, B&B/hotel
BOUW & AMBACHT: aannemer, loodgieter, elektricien, dakwerker, schilder, HVAC/verwarming, tuinaannemer, schrijnwerker, vloerder/tegelzetter
AUTO: garage/autogarage, carwash, autohandel, bandencentrale, autoruiten
MEDISCH: tandarts, huisarts, kinesist, osteopaat, podoloog, logopedist, psycholoog, dierenarts
VASTGOED: immokantoor/makelaar, syndicus, vastgoedbeheer, notaris
RETAIL: bakker, slager, bloemist, optiek, juwelier, kledingwinkel/boetiek, fietsenwinkel, apotheek
FITNESS: fitness/sportschool, crossfit, personal trainer, dansschool, vechtsport
EVENTS: trouwplanner, DJ, catering
HUISDIEREN: dierenarts, trimsalon, dierenpension
TRANSPORT: verhuisfirma, koerier
ONDERWIJS: rijschool, muziekschool, taleninstituut
```

---

## Implementatie

### Stap 1: Database opruimen — fresh start
**Bestanden:** `src/lib/db/schema.ts`, nieuwe migratie

**Schema wijzigingen:**
- Verwijder: `kboCandidates` tabel, `importProfiles` tabel, `candidateStatusEnum`, hun relaties
- Verwijder: `dataSourceEnum` waarde 'kbo_bulk' en 'kvk_open' → vervang door alleen 'google_places' en 'manual'
- Pipeline vereenvoudigen: `pipelineStageEnum` reduceren naar: `'new', 'contacted', 'meeting', 'won', 'ignored'`
- `importLogs` behouden maar alleen voor google_places source

**Data wissen:**
- `DELETE FROM businesses` (cascade wist leadScores, leadStatuses, auditResults, leadPipeline, outreachLog, notes, reminders, statusHistory)
- `DROP TABLE kbo_candidates`
- `DROP TABLE import_profiles`

### Stap 2: Dode code verwijderen
**Verwijder bestanden:**
- `src/lib/pre-scoring.ts`
- `src/lib/candidate-filters.ts`
- `src/lib/types/import-profile.ts`
- `src/lib/google-maps-scraper.ts` (Playwright scraper — niet meer nodig)
- `scripts/kbo-staging-import.ts`
- `scripts/kbo-import.ts`
- `scripts/rescore-candidates-bulk.ts`
- `scripts/scrape-google-maps.ts` (Playwright CLI — niet meer nodig)
- `src/app/api/import-profiles/route.ts`
- `src/app/api/import-profiles/[id]/route.ts`

### Stap 3: Google Places discovery service bouwen
**Nieuw bestand:** `src/lib/places-discovery.ts`

Nieuwe service die Google Places Text Search API aanroept:

```typescript
interface DiscoveredLead {
  placeId: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string;
  photosCount: number;
  googleMapsUri: string;
  // Berekend:
  hasWebsite: boolean;
  qualityScore: number; // snelle score op basis van reviews + website afwezigheid
}

// Zoek leads via Places Text Search
async function discoverLeads(query: string, maxResults: number): Promise<DiscoveredLead[]>

// Sector + stad → query string
function buildSearchQuery(sector: string, city: string): string
```

Gebruikt Places API (New) Text Search endpoint:
- URL: `https://places.googleapis.com/v1/places:searchText`
- Field mask: `places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.photos,places.googleMapsUri`
- Max 20 resultaten per query (API limiet)
- Kwaliteitsfilter: skip CLOSED/PERMANENTLY_CLOSED, skip 0 reviews

Kosten: ~$0.032 per Text Search request = ~312 queries voor €10/maand.
Per query 20 resultaten → max 6.240 leads/maand ontdekt.

### Stap 4: Smart Import route herschrijven
**Bestand:** `src/app/api/leads/smart-import/route.ts` → volledig herschrijven

**GET** `/api/leads/smart-import?sector=beauty&city=Aalst`
- Roept `discoverLeads()` aan
- Retourneert preview van gevonden leads (naam, reviews, rating, website ja/nee)
- GEEN database writes
- Filtert: alleen actieve bedrijven met reviews > 0
- Dedupliceert tegen bestaande businesses (op placeId)

**POST** `/api/leads/smart-import`
- Body: `{ sector: "beauty", city: "Aalst", count: 25 }`
- Importeert top N leads (gesorteerd op kwaliteitsscore)
- Voor elk:
  1. Insert in `businesses` (met Google data al ingevuld!)
  2. Bereken `computeScore()` — nu met volledige Google data → hoge scores
  3. Maak `leadScores`, `leadPipeline` (stage='new') aan
- Log in `importLogs`
- Retourneert geïmporteerde leads

### Stap 5: Scoring opschonen (Bizzy features BEHOUDEN)
**Bestand:** `src/lib/scoring.ts`

De scoring werkt al goed maar nu altijd MET Google data (niet meer cold start). Aanpassingen:
- Verwijder de `dataCompleteness` / `estimatedScore` logica (niet meer nodig — data is altijd compleet bij import)
- Website HTTP check disqualifier aanpassen: niet meer disqualificeren op onbereikbare website (wordt opportunity signaal)
- MaturityCluster classifier werkt nu beter want Google data is er altijd

**ALLE Bizzy/Fase 2 features BEHOUDEN:**
- ✅ Review velocity scoring (recentReviewCount / totalReviewCount) in Activity dimensie
- ✅ Google Business activiteit detectie in Momentum dimensie (GBP wijzigingen, foto delta)
- ✅ "Al bewust digitaal" indicator (Google Ads tag + slechte site = sterkste signaal)
- ✅ Social media + geen website = spanningssignaal
- ✅ Decay factor (audit >90d → Opportunity ×0.5, Google data >90d → Activity ×0.7)
- ✅ MaturityCluster classificatie (A/B/C/D) met multipliers
- ✅ Broken website = opportunity signaal (+8pt)
- ✅ 6-dimensie scoring: Opportunity, Activity, Reachability, Budget, Spanning, Momentum

Deze features werken nu BETER omdat:
1. Google data is er altijd bij import → Spanningssignaal en Activity scoren direct
2. Review velocity kan berekend worden bij re-enrichment (10% API budget)
3. MaturityCluster kan correct classificeren (niet meer "uncertain" door ontbrekende data)

### Stap 6: UI vereenvoudigen
**Bestanden:** meerdere componenten

**Smart Import Button → Smart Import Form:**
- `src/components/leads/smart-import-button.tsx` → herschrijven
- Dropdown: sector selectie (uit volledige lijst)
- Input: stad (text input of dropdown Vlaamse steden)
- "Zoek leads" knop → toont preview (25 resultaten)
- "Importeer" knop → importeert geselecteerde leads
- Toont: naam, reviews, rating, website ja/nee per lead

**Pipeline vereenvoudigen:**
- 5 kolommen: Nieuw | Gecontacteerd | Afspraak | Gewonnen | Genegeerd
- Bestaande pipeline page/component aanpassen op nieuwe stages

**Lead detail pagina:**
- Bedrijfsnaam, adres, telefoon (klikbaar), email, website link
- Google rating + review count
- Score + breakdown
- Notities veld
- Status wijzigen (dropdown: 5 opties)
- Google Maps link (direct naar profiel)

### Stap 7: rescore-leads.ts opschonen
**Bestand:** `scripts/rescore-leads.ts`
- Verwijder het hele kboCandidates rescore-deel
- Houd alleen business rescore

### Stap 8: CLAUDE.md + docs updaten
- Verwijder alle KBO referenties
- Update architectuur beschrijving
- Update commando's (verwijder `npm run kbo-import`, `npm run kbo-staging`)

---

## Kritieke bestanden

| Bestand | Actie |
|---|---|
| `src/lib/db/schema.ts` | EDIT: verwijder kboCandidates, importProfiles, candidateStatusEnum, vereenvoudig pipelineStageEnum |
| `src/lib/places-discovery.ts` | **NIEUW**: Places API Text Search service |
| `src/app/api/leads/smart-import/route.ts` | **HERSCHRIJVEN**: sector+stad → Places API → businesses |
| `src/components/leads/smart-import-button.tsx` | **HERSCHRIJVEN**: sector/stad form met preview |
| `src/lib/scoring.ts` | EDIT: verwijder dataCompleteness, behoud alle Bizzy features |
| `scripts/rescore-leads.ts` | EDIT: verwijder candidates-deel |
| Pipeline pages/componenten | EDIT: 5 stages ipv 11 |
| `lead-dashboard/CLAUDE.md` | EDIT: update docs |
| `scripts/check-business-activity.ts` | BEHOUDEN: Bizzy actief/inactief check |
| `scripts/check-website-health.ts` | BEHOUDEN: website gezondheidscheck |
| `scripts/analyze-conversions.ts` | BEHOUDEN: feedback loop analyse |
| `src/lib/pipeline-logic.ts` | EDIT: aanpassen aan 5 nieuwe stages |
| 12 bestanden | **VERWIJDER**: pre-scoring, candidate-filters, KBO scripts, import-profiles, scraper |

## Verificatie

1. **Build**: `npx tsc --noEmit` → 0 errors, `npm run build` → clean
2. **Fresh DB**: geen businesses, geen kboCandidates tabellen
3. **Import test**: In UI → sector "beauty", stad "Aalst" → preview toont kappers met reviews → importeer 25 → leads verschijnen met scores 50+
4. **Score check**: Kapper met 30 reviews + geen website scoort significant hoger dan advocaat met website
5. **Pipeline**: 5 kolommen werken, drag-and-drop
6. **Lead detail**: telefoon klikbaar, Google Maps link, score breakdown zichtbaar
7. **Geen KBO**: `grep -r "kbo\|kboCandidates\|pre-scoring\|candidate-filters" src/ scripts/` → 0 hits
8. **API budget**: Max 25 Places API calls per import actie (1 Text Search = 20 results)
