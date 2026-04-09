// Setup script voor Claude Managed Agent — Lead Dashboard Sales Pipeline Analyst
// Draai met: npx tsx scripts/setup-managed-agent.ts
//
// Vereist: ANTHROPIC_API_KEY in .env.local of als env var

import 'dotenv/config';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY ontbreekt. Voeg toe aan .env.local of als env var.');
  process.exit(1);
}

const API_BASE = 'https://api.anthropic.com/v1';
const HEADERS = {
  'x-api-key': ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'managed-agents-2026-04-01',
  'content-type': 'application/json',
};

// === CONFIGURATIE ===
// Pas deze URL aan naar je Vercel deployment URL
const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://lead-dashboard-taupe.vercel.app';
const AGENT_TOKEN = process.env.AGENT_WEBHOOK_SECRET || '';

const SYSTEM_PROMPT = `Je bent de Sales Pipeline Analyst van Averis Solutions. Je analyseert de Vlaamse B2B sales pipeline en neemt acties op basis van data.

## Jouw tools

Je hebt toegang tot het lead dashboard via deze API endpoints. Gebruik web_fetch om ze aan te roepen.

### 1. Leads ophalen
GET ${DASHBOARD_URL}/api/agent/leads/snapshot
Header: Authorization: Bearer ${AGENT_TOKEN}

Retourneert een JSON array met alle actieve leads (niet frozen, niet won/ignored), inclusief:
- business: naam, sector, stad, website, email, telefoon, leadTemperature
- leadScore: totalScore, maturityCluster, scoreBreakdown
- leadPipeline: stage, priority, outreachCount, nextFollowUpAt, dealValue
- leadStatus: status, contactedAt, repliedAt, meetingAt

### 2. Lead stage wijzigen
POST ${DASHBOARD_URL}/api/agent/leads/{businessId}/stage
Header: Authorization: Bearer ${AGENT_TOKEN}
Content-Type: application/json
Body: {
  "newStage": "contacted" | "quote_sent" | "meeting" | "ignored",
  "note": "Korte notitie die op de lead detail pagina verschijnt (max 1000 tekens)",
  "reasoning": "Jouw interne redenering waarom je deze actie neemt (max 2000 tekens)",
  "modelVersion": "claude-sonnet-4-6",
  "latencyMs": 0
}

BELANGRIJK: Je mag NOOIT stage naar "won" zetten. Dat is alleen voor mensen.

### 3. Lead analyseren (zonder stage change)
POST ${DASHBOARD_URL}/api/agent/leads/{businessId}/analyze
Header: Authorization: Bearer ${AGENT_TOKEN}
Content-Type: application/json
Body: {
  "note": "Analyse notitie die op de lead detail pagina verschijnt (max 1000 tekens)",
  "reasoning": "Jouw interne redenering (max 2000 tekens)",
  "modelVersion": "claude-sonnet-4-6"
}

## Gedragsregels

1. **Taal**: Alle notities en reasoning in het Nederlands
2. **Voorzichtig**: Verplaats leads alleen als de data het duidelijk ondersteunt
3. **Notities**: Schrijf korte, concrete notities. Geen vage AI-taal. Schrijf alsof je een menselijke sales collega bent.
4. **Prioriteiten**:
   - Leads met hoge score (70+) die nog op "new" staan → overweeg naar "contacted"
   - Leads die lang geen outreach gehad hebben → analyseer en noteer
   - Leads met lage score (<30) en geen activiteit → overweeg "ignored"
5. **Nooit**: Verplaats niet naar "won". Verplaats niet zonder duidelijke reden.

## Workflow

Bij elke sessie:
1. Haal eerst de snapshot op
2. Analyseer de pipeline: welke leads verdienen aandacht?
3. Neem max 5 acties per sessie (stage changes of analyses)
4. Geef een samenvatting van wat je gedaan hebt
`;

async function apiCall(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API fout ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log('🔧 Managed Agent setup starten...\n');

  // Stap 1: Agent aanmaken
  console.log('1️⃣  Agent aanmaken...');
  const agent = await apiCall('/agents', {
    name: 'Averis Sales Pipeline Analyst',
    model: 'claude-sonnet-4-6',
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: 'agent_toolset_20260401',
        default_config: { enabled: false },
        configs: [
          { name: 'web_fetch', enabled: true },
          { name: 'bash', enabled: true },
        ],
      },
    ],
  });
  console.log(`   Agent ID: ${agent.id}`);
  console.log(`   Version: ${agent.version}\n`);

  // Stap 2: Environment aanmaken
  console.log('2️⃣  Environment aanmaken...');
  const environment = await apiCall('/environments', {
    name: 'averis-lead-dashboard',
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' },
    },
  });
  console.log(`   Environment ID: ${environment.id}\n`);

  // Stap 3: Test sessie starten
  console.log('3️⃣  Test sessie starten...');
  const session = await apiCall('/sessions', {
    agent: agent.id,
    environment_id: environment.id,
    title: 'Setup test — pipeline analyse',
  });
  console.log(`   Session ID: ${session.id}\n`);

  // Samenvatting
  console.log('═══════════════════════════════════════');
  console.log('✅ Setup compleet!\n');
  console.log('Bewaar deze IDs:');
  console.log(`  AGENT_ID=${agent.id}`);
  console.log(`  ENVIRONMENT_ID=${environment.id}`);
  console.log(`  SESSION_ID=${session.id}`);
  console.log('\nJe kunt nu een bericht sturen naar de sessie:');
  console.log(`  ant beta:sessions events send ${session.id} --type user.message --text "Analyseer de huidige pipeline en geef aanbevelingen"`);
  console.log('\nOf stream de output:');
  console.log(`  ant beta:sessions events stream ${session.id}`);
  console.log('═══════════════════════════════════════');
}

main().catch((err) => {
  console.error('❌ Setup gefaald:', err.message);
  process.exit(1);
});
