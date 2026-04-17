# n8n Workflows voor Lead Dashboard Automation

Drie (en één placeholder) workflows die samen de 24u-cyclus draaien:

## Workflows in deze map

### 1. `throttled-send-worker.json` — LIVE ready
Elke 5 minuten (Mon-Fri 09-17 Europe/Brussels) pakt één approved draft uit de
wachtrij en verstuurt via Resend.

- Endpoint: `POST /api/daily-batch/to-send`
- Respecteert kill-switch (`send_enabled=false`) en warmup cap
- Race-safe via conditional UPDATE; 2 parallelle workers kunnen nooit dezelfde draft sturen

### 2. `morning-qualification-batch.json` — LIVE ready
Elke werkdag om 06:00: haalt de qualification queue op, roept per lead
`/api/enrich/full/[id]` aan (5 parallel in batches).

- Endpoint: `GET /api/daily-batch/qualification-queue?limit=50` + `POST /api/enrich/full/[id]`
- Retry 2x bij 5xx; timeout 120s per lead voor Opus tiebreaker ruimte

### 3. `daily-summary-digest.json` — LIVE ready
Elke werkdag om 18:00: Telegram message met sent/bounced/cost/queue/warmup + top reject redenen.

- Endpoint: `GET /api/daily-batch/summary`
- Alert-signalen: bounce >2% of complaint >0.1%
- Ook: upsert `dailyBatches` record voor historische tracking

### 4. `daily-lead-discovery.json` — TODO (niet in repo)
Om 05:00 nieuwe leads scrapen via Google Places met rotating NACE/provincie.

**Waarom nog niet**: het bestaande `/api/leads/smart-import` endpoint is sessie-beschermd
en de Google Places logica is verweven met UI-assumpties (rate-limiting, sector-labels).

**Aanbevolen aanpak**:
- Ofwel: handmatig importeren via UI (current flow voor Imad)
- Ofwel: maak `/api/daily-batch/discover` endpoint dat `discoverLeads()` + insert doet met Bearer auth
- n8n workflow belt dan dit endpoint met dagelijks rotérende sector + city params (dag-van-jaar modulo ALL_SECTORS.length)

Voor nu blijft discovery handmatig via `/leads` UI.

## Setup

### 1. Credentials in n8n

Maak twee credentials aan via n8n UI → Credentials → Create:

- **Lead Dashboard Bearer** (type: HTTP Header Auth)
  - Header Name: `Authorization`
  - Header Value: `Bearer <waarde van N8N_WEBHOOK_SECRET uit Vercel env>`

- **Telegram Bot** (type: Telegram API) — alleen voor summary digest
  - Access Token: van @BotFather

### 2. Environment variables in n8n

In n8n Settings → Environment Variables:

- `LEAD_DASHBOARD_URL`: production URL zonder trailing slash, bv. `https://lead-dashboard-taupe.vercel.app`
  voor main, of `https://lead-dashboard-git-full-automation-imads-projects-746a9425.vercel.app` voor preview.
- `TELEGRAM_CHAT_ID`: Imad's chat ID (via @userinfobot Telegram bot op te vragen)

### 3. Import workflows

Voor elk JSON-bestand in deze map:
1. n8n UI → Workflows → Import from File
2. Selecteer het JSON bestand
3. Ken credentials toe waar gevraagd
4. Activate de workflow

### 4. Eerste keer: warmup starten

Via admin UI `/settings` (of via SQL):
```sql
INSERT INTO system_settings (key, value, updated_at)
VALUES ('warmup_start_date', '"2026-04-18"'::jsonb, NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

Vanaf die datum: week 1 = 10/dag, week 2 = 25/dag, week 3 = 50/dag, daarna 100/dag.

## Monitoring

- **Queue depth**: `GET /api/daily-batch/to-send` geeft remaining budget + queue depth
- **Cost tracking**: `GET /api/daily-batch/summary` toont cost per endpoint
- **dailyBatches tabel**: historisch record per dag (wordt automatisch geüpsert door summary endpoint)

## Kill-switch

Pauze alle sends direct via:
```sql
UPDATE system_settings SET value = 'false'::jsonb WHERE key = 'send_enabled';
-- of via admin UI /settings
```

De Throttled Send Worker stopt bij de volgende cron-tick.
