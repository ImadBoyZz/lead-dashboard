import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient, { schema });

type ActivityStatus = 'active' | 'uncertain' | 'likely_inactive' | 'confirmed_closed';

function classifyActivity(business: typeof schema.businesses.$inferSelect): {
  status: ActivityStatus;
  lastKnownActivityAt: Date;
} {
  // Most recent signal date
  const lastKnownActivityAt = business.googlePlacesEnrichedAt ?? business.createdAt;

  // 1. Confirmed closed: GBP permanently closed OR enterprise not active (KBO)
  if (business.googleBusinessStatus === 'CLOSED_PERMANENTLY') {
    return { status: 'confirmed_closed', lastKnownActivityAt };
  }

  // 2. Active: has recent reviews OR GBP operational
  if (
    (business.recentReviewCount !== null && business.recentReviewCount > 0) ||
    business.googleBusinessStatus === 'OPERATIONAL'
  ) {
    return { status: 'active', lastKnownActivityAt };
  }

  // 3. Likely inactive: founded >5 years ago AND no reviews AND no website AND no GBP
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  const foundedLongAgo = business.foundedDate
    ? new Date(business.foundedDate) < fiveYearsAgo
    : false;
  const noReviews = !business.googleReviewCount || business.googleReviewCount === 0;
  const noWebsite = !business.website;
  const noGbp = !business.hasGoogleBusinessProfile;

  if (foundedLongAgo && noReviews && noWebsite && noGbp) {
    return { status: 'likely_inactive', lastKnownActivityAt };
  }

  // 4. Everything else: uncertain
  return { status: 'uncertain', lastKnownActivityAt };
}

async function main() {
  console.log('Fetching all businesses...');

  const allBusinesses = await db.select().from(schema.businesses);
  console.log(`Found ${allBusinesses.length} businesses to classify.\n`);

  const summary = { active: 0, uncertain: 0, likely_inactive: 0, confirmed_closed: 0 };

  // Classify all businesses
  const updates: { id: string; status: ActivityStatus; lastKnownActivityAt: Date }[] = [];

  for (const biz of allBusinesses) {
    const { status, lastKnownActivityAt } = classifyActivity(biz);
    summary[status]++;
    updates.push({ id: biz.id, status, lastKnownActivityAt });
  }

  // Batch update all businesses
  console.log('Updating businesses...');
  let updated = 0;

  for (const upd of updates) {
    await db
      .update(schema.businesses)
      .set({
        businessActivityStatus: upd.status,
        lastKnownActivityAt: upd.lastKnownActivityAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.businesses.id, upd.id));
    updated++;
  }

  console.log(`\nUpdated ${updated} businesses.\n`);
  console.log('=== Activity Classification Summary ===');
  console.log(`  Active:           ${summary.active}`);
  console.log(`  Uncertain:        ${summary.uncertain}`);
  console.log(`  Likely inactive:  ${summary.likely_inactive}`);
  console.log(`  Confirmed closed: ${summary.confirmed_closed}`);
  console.log(`  Total:            ${allBusinesses.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
