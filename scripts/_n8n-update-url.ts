// Update de URL in de 3 live n8n workflows: preview → productie URL.
// Doet een GET per workflow, vervangt string, PUT terug.

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const N8N_URL = process.env.N8N_BASE_URL ?? 'https://n8n.srv1377442.hstgr.cloud';
if (!process.env.N8N_API_TOKEN) {
  console.error('N8N_API_TOKEN ontbreekt in .env.local');
  process.exit(1);
}
const N8N_TOKEN: string = process.env.N8N_API_TOKEN;

const OLD_URL = 'https://lead-dashboard-git-full-automation-imads-projects-746a9425.vercel.app';
const NEW_URL = 'https://lead-dashboard-taupe.vercel.app';

const WORKFLOW_IDS = [
  'PgZA0DoOq7vaNAjO', // Throttled Send Worker
  'WD5Watc5ZCaAZAWZ', // Morning Qualification Batch
  'WU6uOy1ES7KOx3Zt', // Daily Summary Digest
];

async function main() {
  for (const id of WORKFLOW_IDS) {
    const res = await fetch(`${N8N_URL}/api/v1/workflows/${id}`, {
      headers: { 'X-N8N-API-KEY': N8N_TOKEN },
    });
    if (!res.ok) {
      console.error(`✗ ${id} GET faalde: ${res.status}`);
      continue;
    }
    const wf = (await res.json()) as Record<string, unknown>;
    const body = JSON.stringify(wf);
    if (!body.includes(OLD_URL)) {
      console.log(`⊘ ${id} (${wf.name}) — OLD_URL niet gevonden, skip`);
      continue;
    }
    const updated = JSON.parse(body.replaceAll(OLD_URL, NEW_URL)) as Record<string, unknown>;
    // n8n PUT accepteert alleen bepaalde velden
    const payload = {
      name: updated.name,
      nodes: updated.nodes,
      connections: updated.connections,
      settings: updated.settings ?? { executionOrder: 'v1' },
    };
    const put = await fetch(`${N8N_URL}/api/v1/workflows/${id}`, {
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': N8N_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!put.ok) {
      console.error(`✗ ${id} PUT faalde: ${put.status} ${await put.text()}`);
      continue;
    }
    console.log(`✓ ${id} (${wf.name}) — URL geüpdatet`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
