import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { inArray, and, eq, isNotNull } = await import('drizzle-orm');

  const rows = await db.select({
    id: schema.businesses.id, name: schema.businesses.name,
    website: schema.businesses.website, email: schema.businesses.email,
    emailSource: schema.businesses.emailSource,
    emailStatus: schema.businesses.emailStatus,
  }).from(schema.businesses).where(inArray(schema.businesses.id, [
    '05e1cc51-1746-43f4-aad8-6193553771dc', // Ventilatietechnieken Bilk (modern)
    '344d3a3d-c98a-4b55-92e9-1132ef898a97', // Herenkapper Yavo
    '86b61357-5637-49e8-80c5-874161dd669d', // Enova Solar
  ]));
  for (const r of rows) console.log(r);
})();
