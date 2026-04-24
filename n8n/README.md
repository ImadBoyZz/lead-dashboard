# n8n Workflows voor Lead Dashboard Automation

Zes workflows die samen de volledig autonome 24u-cyclus draaien: discover → qualify → generate → (manual approve) → send → deliverability check → digest.

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
- **Auto-promote**: `/api/enrich/full/[id]` zet aan het einde `lead_temperature='warm'` als criteria matchen (geen disqualifier, `website_verdict IN ('none','outdated','parked')`, `email_status IN ('mx_valid','smtp_valid')`, niet-franchise). Idempotent via `auto_promoted_at` kolom — handmatige Triage-downgrades blijven behouden.

### 3. `daily-summary-digest.json` — LIVE ready
Elke werkdag om 18:00: Telegram message met sent/bounced/cost/queue/warmup + top reject redenen.

- Endpoint: `GET /api/daily-batch/summary`
- Alert-signalen: bounce >2% of complaint >0.1%
- Ook: upsert `dailyBatches` record voor historische tracking

### 4. `daily-lead-discovery.json` — LIVE ready
Elke werkdag 05:00: kiest één (sector, city) combinatie uit een 5×8 rotatie-tabel (dag-van-jaar modulo) en importeert tot 50 leads via Google Places.

- Endpoint: `POST /api/daily-batch/discover` (Bearer)
- Idempotent: endpoint checkt `batch_runs` op `(job_type='discover', run_date, sector, city)` — retry na timeout = 200 skipped
- Timeout 120s, 2 retries met 10s wacht

### 5. `daily-draft-generation.json` — LIVE ready
Elke werkdag 07:30: genereert drafts voor warme leads tot cap = `warmupCap × 2` (absolute max 50).

- Endpoint: `POST /api/daily-batch/generate-drafts` (Bearer)
- Pre-flight gates: `isSendingPaused` + `assertBudgetAvailable` — skip zonder AI-burn bij paused/budget-exhausted
- Per-lead: dedup (`alreadyContactedRecently`) + pipeline safeguard (`ACTIVE_DEAL_STAGES`) + per-lead budget floor €0.08
- 07:30 (niet 07:00) = buffer na `morning-qualification-batch`

### 6. `deliverability-monitor.json` — LIVE ready
Elke 30 min tussen 08:00-22:00: rolling 7d bounce%/complaint% check. Bij drempel (bounce>2% + ≥3 bounces OF complaint>0.1% + ≥1) flipt `send_enabled=false` + Telegram alert.

- Endpoint: `GET /api/daily-batch/deliverability-check` (Bearer)
- **Min-volume floor**: skipt logic tenzij ≥20 delivered in 7d (voorkomt false positives in warmup bij kleine volumes)
- Endpoint stuurt zelf Telegram als `TELEGRAM_BOT_TOKEN` in Vercel env staat; n8n heeft backup Telegram node

## Gefaseerde rollout (4 dagen)

Consensus van multi-agent review: NIET alles tegelijk aanzetten in warmup.

- **Dag 1**: `deliverability-monitor` AAN (read-only bij normaal volume)
- **Dag 2**: `daily-lead-discovery` AAN. Eerst handmatig curlen met `limit=20` + tijdelijk `PLACES_API_MAX_CALLS=50` in Vercel env
- **Dag 3-4**: observeer `batch_runs` — welke sectoren slagen, duplicates-ratio
- **Dag 5**: `daily-draft-generation` AAN. Eerst 2x handmatig curlen om cost per run te meten, `/review` queue monitoren

Observability query: `SELECT job_type, run_date, status, input_count, output_count, cost_eur FROM batch_runs ORDER BY started_at DESC LIMIT 20;`

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

In Vercel env (zowel preview als production):

- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`: voor in-app alerting (deliverability-check endpoint stuurt zelf als beide gezet zijn). Optioneel — als ontbreekt valt alerting terug op n8n backup node.

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
