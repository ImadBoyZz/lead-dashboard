// Upload de 3 autonomy workflows naar n8n via REST API.
// Strip velden die n8n niet accepteert op create (_comments, active, id, tags).
// Print de id van elke gemaakte workflow zodat we ze daarna kunnen activeren.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const N8N_URL = 'https://n8n.srv1377442.hstgr.cloud';
const N8N_API_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlM2IzODA3MC1mNDI1LTQ3YmUtOWRhNC0yMGIwZjZiMjE3MGIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjA2NmUwNzEtNWZhYy00YzAzLTg5OTItZjQ2ODE4ZDQ5MjA3IiwiaWF0IjoxNzc1MzE1MTg1fQ.0GGsR6I1U5shs8yBYttyATjSX70kUvhBk5WIWL4CbjA';

const WORKFLOWS = [
  'n8n/daily-lead-discovery.json',
  'n8n/daily-draft-generation.json',
  'n8n/deliverability-monitor.json',
];

interface N8nWorkflowPayload {
  name: string;
  nodes: unknown[];
  connections: Record<string, unknown>;
  settings: Record<string, unknown>;
}

async function main() {
  for (const file of WORKFLOWS) {
    const content = await readFile(path.resolve(process.cwd(), file), 'utf8');
    const raw = JSON.parse(content);

    // n8n POST /workflows rejects: id, active, tags, _comments, pinData, versionId, etc
    const payload: N8nWorkflowPayload = {
      name: raw.name,
      nodes: raw.nodes,
      connections: raw.connections,
      settings: raw.settings ?? { executionOrder: 'v1' },
    };

    const res = await fetch(`${N8N_URL}/api/v1/workflows`, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`✗ ${file}: HTTP ${res.status}`);
      console.error(`  ${body.slice(0, 500)}`);
      process.exit(1);
    }

    const result = (await res.json()) as { id: string; name: string };
    console.log(`✓ ${result.name.padEnd(32)} id=${result.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
