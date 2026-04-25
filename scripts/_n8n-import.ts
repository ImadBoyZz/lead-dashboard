// Import de 3 n8n workflow blueprints uit /n8n/ via de n8n REST API.
// Vervangt placeholders voor credential IDs en env-var-URLs door echte waarden.
//
// Gebruik: npx tsx scripts/_n8n-import.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '.env.local') });

const N8N_URL = process.env.N8N_BASE_URL ?? 'https://n8n.srv1377442.hstgr.cloud';
if (!process.env.N8N_API_TOKEN) {
  console.error('N8N_API_TOKEN ontbreekt in .env.local');
  process.exit(1);
}
const N8N_TOKEN: string = process.env.N8N_API_TOKEN;

const LEAD_DASHBOARD_URL = 'https://lead-dashboard-git-full-automation-imads-projects-746a9425.vercel.app';
const BEARER_CREDENTIAL_ID = 'a2eXKSzvjjZMwlFm'; // Lead Dashboard Bearer — aangemaakt in vorige stap
const BEARER_CREDENTIAL_NAME = 'Lead Dashboard Bearer';
const SMTP_CREDENTIAL_ID = 'jp73632PtSzy2vJQ'; // notifications@averissolutions.be
const SMTP_CREDENTIAL_NAME = 'notifications@averissolutions.be';
const DIGEST_TO_EMAIL = 'bardid.imad@gmail.com';

interface WorkflowFile {
  file: string;
  transform?: (wf: WorkflowShape) => WorkflowShape;
}

interface WorkflowShape {
  name: string;
  nodes: Array<Record<string, unknown>>;
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

const WORKFLOWS: WorkflowFile[] = [
  { file: 'throttled-send-worker.json' },
  { file: 'morning-qualification-batch.json' },
  { file: 'daily-summary-digest.json', transform: replaceTelegramWithEmail },
  { file: 'daily-lead-discovery.json' },
  { file: 'daily-draft-generation.json' },
  { file: 'deliverability-monitor.json' },
];

/**
 * Vervang Telegram node door emailSend via SMTP credential.
 * Digest gaat dan per mail naar bardid.imad@gmail.com i.p.v. Telegram.
 */
function replaceTelegramWithEmail(wf: WorkflowShape): WorkflowShape {
  wf.nodes = wf.nodes.map((n) => {
    if (n.type === 'n8n-nodes-base.telegram') {
      return {
        parameters: {
          fromEmail: 'notifications@averissolutions.be',
          toEmail: DIGEST_TO_EMAIL,
          subject: '={{`Lead Dashboard digest — ${$json.summary.date}`}}',
          emailFormat: 'text',
          text: '={{$json.text}}',
          options: {},
        },
        id: n.id,
        name: 'Send to Email',
        type: 'n8n-nodes-base.emailSend',
        typeVersion: 2.1,
        position: n.position,
        credentials: {
          smtp: { id: SMTP_CREDENTIAL_ID, name: SMTP_CREDENTIAL_NAME },
        },
      };
    }
    return n;
  });
  // Update connection-node-name in case we renamed "telegram" → "Send to Email"
  if (wf.connections['format']) {
    wf.connections['format'] = {
      main: [[{ node: 'Send to Email', type: 'main', index: 0 }]],
    };
  }
  return wf;
}

function normalizeWorkflow(raw: WorkflowShape): WorkflowShape {
  // 1. Vervang env-URL placeholder
  const replaced = JSON.parse(
    JSON.stringify(raw).replaceAll('{{$env.LEAD_DASHBOARD_URL}}', LEAD_DASHBOARD_URL),
  ) as WorkflowShape;

  // 2. Vervang credential placeholders
  for (const node of replaced.nodes) {
    const creds = node.credentials as Record<string, { id?: string; name?: string }> | undefined;
    if (creds?.httpHeaderAuth) {
      creds.httpHeaderAuth = {
        id: BEARER_CREDENTIAL_ID,
        name: BEARER_CREDENTIAL_NAME,
      };
    }
  }

  // 3. n8n API accepteert geen extra velden zoals _comments, active, tags, id
  const whitelisted: WorkflowShape = {
    name: replaced.name,
    nodes: replaced.nodes,
    connections: replaced.connections,
    settings: replaced.settings ?? { executionOrder: 'v1' },
  };

  return whitelisted;
}

async function upsertWorkflow(wf: WorkflowShape): Promise<string> {
  // Check of naam al bestaat
  const list = await fetch(`${N8N_URL}/api/v1/workflows?name=${encodeURIComponent(wf.name)}`, {
    headers: { 'X-N8N-API-KEY': N8N_TOKEN },
  }).then((r) => r.json() as Promise<{ data: Array<{ id: string; name: string }> }>);

  const existing = list.data?.find((w) => w.name === wf.name);

  if (existing) {
    const res = await fetch(`${N8N_URL}/api/v1/workflows/${existing.id}`, {
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': N8N_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(wf),
    });
    if (!res.ok) {
      throw new Error(`PUT ${wf.name} faalde: ${res.status} ${await res.text()}`);
    }
    return `updated (${existing.id})`;
  }

  const res = await fetch(`${N8N_URL}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': N8N_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(wf),
  });
  if (!res.ok) {
    throw new Error(`POST ${wf.name} faalde: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return `created (${body.id})`;
}

async function main() {
  for (const entry of WORKFLOWS) {
    const path = resolve('n8n', entry.file);
    let raw = JSON.parse(readFileSync(path, 'utf8')) as WorkflowShape;
    if (entry.transform) raw = entry.transform(raw);
    const wf = normalizeWorkflow(raw);
    try {
      const outcome = await upsertWorkflow(wf);
      console.log(`✓ ${wf.name} — ${outcome}`);
    } catch (err) {
      console.error(`✗ ${wf.name} — ${(err as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
