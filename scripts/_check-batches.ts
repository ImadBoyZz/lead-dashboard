import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { desc } = await import('drizzle-orm');

  const rows = await db.select().from(schema.dailyBatches)
    .orderBy(desc(schema.dailyBatches.runDate)).limit(5);
  for (const r of rows) console.log(r);
})();
