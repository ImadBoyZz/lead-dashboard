import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { inArray } = await import('drizzle-orm');

  const rows = await db.select({
    id: schema.businesses.id, name: schema.businesses.name,
    classification: schema.businesses.chainClassification,
    confidence: schema.businesses.chainConfidence,
    classifiedAt: schema.businesses.chainClassifiedAt,
    reason: schema.businesses.chainReason,
  }).from(schema.businesses).where(inArray(schema.businesses.id, [
    '0bd47421-136e-4034-8041-a0a99d85b001',
    '86b61357-5637-49e8-80c5-874161dd669d',
  ]));
  for (const r of rows) console.log(r);
})();
