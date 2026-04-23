import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq, desc } = await import('drizzle-orm');

  const rows = await db
    .select({
      id: schema.outreachDrafts.id,
      subject: schema.outreachDrafts.subject,
      body: schema.outreachDrafts.body,
      tone: schema.outreachDrafts.tone,
      businessId: schema.outreachDrafts.businessId,
      businessName: schema.businesses.name,
      naceDescription: schema.businesses.naceDescription,
      city: schema.businesses.city,
      website: schema.businesses.website,
      sector: schema.businesses.sector,
      googleReviewCount: schema.businesses.googleReviewCount,
    })
    .from(schema.outreachDrafts)
    .innerJoin(schema.businesses, eq(schema.outreachDrafts.businessId, schema.businesses.id))
    .where(eq(schema.outreachDrafts.status, 'pending'))
    .orderBy(desc(schema.outreachDrafts.createdAt))
    .limit(3);

  for (const r of rows) {
    console.log('=== LEAD:', r.businessName, '|', r.city, '|', r.naceDescription ?? r.sector ?? '-', '|', r.website, '===');
    console.log('Subject:', JSON.stringify(r.subject));
    console.log('Tone:', r.tone);
    console.log('Body:');
    console.log(r.body);
    console.log('---\n');
  }
})();
