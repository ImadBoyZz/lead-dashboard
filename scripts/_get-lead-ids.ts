import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { sql, isNotNull } = await import('drizzle-orm');

  const rows = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      website: schema.businesses.website,
      naceDescription: schema.businesses.naceDescription,
      chainClassification: schema.businesses.chainClassification,
      googleReviewCount: schema.businesses.googleReviewCount,
    })
    .from(schema.businesses)
    .where(isNotNull(schema.businesses.name))
    .orderBy(sql`RANDOM()`)
    .limit(15);

  for (const r of rows) {
    console.log(
      `${r.id} | ${r.name.slice(0, 40).padEnd(40)} | site=${r.website ? 'Y' : 'N'} | reviews=${r.googleReviewCount ?? '-'} | ${r.naceDescription?.slice(0, 35) ?? ''} | chain=${r.chainClassification ?? 'null'}`,
    );
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
