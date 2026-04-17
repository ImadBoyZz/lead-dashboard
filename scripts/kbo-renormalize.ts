// Herberekent normalized_denomination voor alle rijen in kbo_lookup zonder
// de hele CSV opnieuw te importeren. Gebruik na normalize.ts wijziging.

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

import { neon } from '@neondatabase/serverless';
import { normalizeBusinessName } from '../src/lib/kbo/normalize';

const sql = neon(process.env.DATABASE_URL!);
const BATCH_SIZE = 2000;

async function main() {
  const start = Date.now();
  const [{ n: total }] = await sql`SELECT count(*)::int as n FROM kbo_lookup` as [{ n: number }];
  console.log(`Re-normalizing ${total.toLocaleString('nl-BE')} rijen...`);

  let offset = 0;
  let updated = 0;
  while (offset < total) {
    const rows = await sql`
      SELECT enterprise_number, denomination
      FROM kbo_lookup
      ORDER BY enterprise_number
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    ` as Array<{ enterprise_number: string; denomination: string }>;
    if (rows.length === 0) break;

    const payload = JSON.stringify(
      rows.map((r) => ({
        enterprise_number: r.enterprise_number,
        normalized_denomination: normalizeBusinessName(r.denomination),
      })),
    );
    await sql`
      UPDATE kbo_lookup kl
      SET normalized_denomination = u.normalized_denomination
      FROM jsonb_to_recordset(${payload}::jsonb) AS u(enterprise_number text, normalized_denomination text)
      WHERE kl.enterprise_number = u.enterprise_number
    `;
    updated += rows.length;
    offset += rows.length;
    if (updated % 20_000 === 0) console.log(`  ${updated.toLocaleString('nl-BE')} / ${total.toLocaleString('nl-BE')}`);
  }

  const duration = Math.round((Date.now() - start) / 1000);
  console.log(`\n✓ ${updated.toLocaleString('nl-BE')} rijen her-genormaliseerd in ${duration}s\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
