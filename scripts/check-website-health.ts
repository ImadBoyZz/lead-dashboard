import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, isNotNull } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient, { schema });

const DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}

async function checkWebsite(url: string): Promise<{ healthy: boolean; status: number | null; error?: string }> {
  try {
    const response = await fetch(normalizeUrl(url), {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    const healthy = response.status >= 200 && response.status < 400;
    return { healthy, status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('timeout') || message.includes('abort');
    return { healthy: false, status: null, error: isTimeout ? 'timeout' : message };
  }
}

async function main() {
  console.log('Fetching businesses with websites...');

  const businessesWithWebsite = await db
    .select()
    .from(schema.businesses)
    .where(isNotNull(schema.businesses.website));

  // Filter out empty strings
  const targets = businessesWithWebsite.filter((b) => b.website && b.website.trim().length > 0);
  console.log(`Found ${targets.length} businesses with a website URL.\n`);

  const summary = { healthy: 0, unhealthy: 0, timeout: 0 };
  const brokenSiteOpportunities: { name: string; website: string; reviewCount: number }[] = [];
  const now = new Date();

  for (let i = 0; i < targets.length; i++) {
    const biz = targets[i];
    const url = biz.website!;

    process.stdout.write(`[${i + 1}/${targets.length}] ${biz.name} (${url}) ... `);

    const result = await checkWebsite(url);

    if (result.healthy) {
      summary.healthy++;
      console.log(`OK (${result.status})`);
    } else if (result.error === 'timeout') {
      summary.timeout++;
      console.log('TIMEOUT');
    } else {
      summary.unhealthy++;
      console.log(`FAIL (${result.status ?? result.error})`);
    }

    // Update database
    await db
      .update(schema.businesses)
      .set({
        websiteHealthy: result.healthy,
        websiteLastCheckedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.businesses.id, biz.id));

    // Flag broken site opportunities: unhealthy site + active business (has reviews)
    if (!result.healthy && biz.googleReviewCount && biz.googleReviewCount > 0) {
      brokenSiteOpportunities.push({
        name: biz.name,
        website: url,
        reviewCount: biz.googleReviewCount,
      });
    }

    // Polite delay between requests
    if (i < targets.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log('\n=== Website Health Summary ===');
  console.log(`  Healthy:   ${summary.healthy}`);
  console.log(`  Unhealthy: ${summary.unhealthy}`);
  console.log(`  Timeout:   ${summary.timeout}`);
  console.log(`  Total:     ${targets.length}`);

  if (brokenSiteOpportunities.length > 0) {
    console.log(`\n=== Broken Site Opportunities (${brokenSiteOpportunities.length}) ===`);
    console.log('Active businesses with broken websites:');
    for (const opp of brokenSiteOpportunities) {
      console.log(`  - ${opp.name} (${opp.reviewCount} reviews) — ${opp.website}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
