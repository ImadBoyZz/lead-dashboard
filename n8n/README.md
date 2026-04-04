# n8n Workflows voor Lead Dashboard

## Setup

### 1. Environment Variables
Stel deze in op je n8n instance (Settings → Variables):
- `DASHBOARD_URL`: https://lead-dashboard-taupe.vercel.app (of je custom domein)

### 2. Import Workflow
1. Open n8n
2. Ga naar Workflows → Import from File
3. Selecteer `enrichment-workflow.json`
4. Activeer de workflow

### 3. Firecrawl API Key
De Firecrawl API key moet ingesteld zijn als environment variable in Vercel:
- `FIRECRAWL_API_KEY`: je Firecrawl API key

### Workflows

#### Website Enrichment (dagelijks om 02:00)
- Haalt max 50 nieuwe leads op
- Scrapt elke website met Firecrawl + Google PageSpeed
- Berekent automatisch een lead score
- Verwerkt 1 lead per 3 seconden (rate limiting)

#### Weekly Stats Check (zondag om 03:00)
- Haalt dashboard statistieken op
- Controleert op hot leads (score 70+)
- Placeholder voor notificatie (email/Slack/Telegram)
