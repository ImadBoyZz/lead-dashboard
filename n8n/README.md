# n8n Workflows voor Lead Dashboard

## Setup

### 1. Environment Variables
Stel deze in op je n8n instance (Settings > Variables):
- `DASHBOARD_URL`: https://lead-dashboard-taupe.vercel.app (of je custom domein)

### 2. Import Workflow
1. Open n8n
2. Ga naar Workflows > Import from File
3. Selecteer het gewenste workflow JSON bestand
4. Activeer de workflow

### 3. Firecrawl API Key
De Firecrawl API key moet ingesteld zijn als environment variable in Vercel:
- `FIRECRAWL_API_KEY`: je Firecrawl API key

## Workflows

### 1. Website Enrichment (`enrichment-workflow.json`) — dagelijks om 02:00
- Haalt max 50 nieuwe leads op
- Scrapt elke website met Firecrawl + Google PageSpeed
- Google Places enrichment (rating, reviews, GBP status)
- Detecteert Google Ads tags, social media links, analytics
- Berekent automatisch lead score met MaturityCluster
- Verwerkt 1 lead per 3 seconden (rate limiting)

### 2. Re-Enrichment (`re-enrichment-workflow.json`) — wekelijks op maandag 03:00
- Zoekt leads waarvan Google Places data ouder is dan 90 dagen
- Verrijkt opnieuw via `/api/enrich` (zelfde endpoint, detecteert re-enrichment)
- Berekent review velocity (nieuwe reviews / totaal reviews)
- Detecteert GBP wijzigingen (foto's, rating veranderingen)
- Updated maturityCluster en decay-factoren
- Max 20 leads per run, 5 seconden tussen elke call

### 3. Weekly Stats Check — zondag om 03:00
- Haalt dashboard statistieken op
- Controleert op hot leads (score 70+)
- Placeholder voor notificatie (email/Slack/Telegram)

## API Endpoints (gebruikt door workflows)

| Endpoint | Methode | Doel |
|---|---|---|
| `/api/leads?status=new&limit=50` | GET | Nieuwe leads ophalen |
| `/api/leads/stale?days=90&limit=20` | GET | Leads met verouderde data |
| `/api/enrich` | POST | Enrichment + scoring (eerste keer en re-enrichment) |
| `/api/stats` | GET | Dashboard statistieken |

## Fase 2 Signalen (automatisch via enrichment)

De `/api/enrich` endpoint verwerkt nu automatisch:
- **Review velocity**: vergelijkt huidige review count met vorige, berekent snelheid
- **GBP delta-detectie**: detecteert wijzigingen in foto's en rating
- **Google Ads tag**: Firecrawl detecteert gtag met AW- conversion ID
- **Social media links**: Firecrawl detecteert Facebook/Instagram/LinkedIn links
- **Decay**: scores worden automatisch verlaagd als data ouder is dan 90 dagen
