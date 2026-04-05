import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient);

async function main() {
  const distribution = await db.execute(
    sql`SELECT total_score, count(*)::int as cnt FROM lead_scores GROUP BY total_score ORDER BY total_score DESC`
  );
  console.log('\n=== Score Distributie ===');
  for (const r of distribution.rows) {
    const label = (r.total_score as number) >= 70 ? 'HOT' : (r.total_score as number) >= 40 ? 'WARM' : 'KOUD';
    console.log(`  Score ${r.total_score}: ${r.cnt} leads [${label}]`);
  }

  const samples = await db.execute(
    sql`SELECT b.name, ls.total_score, ls.score_breakdown
        FROM lead_scores ls
        JOIN businesses b ON b.id = ls.business_id
        ORDER BY ls.total_score DESC
        LIMIT 10`
  );
  console.log('\n=== Top 10 Leads ===');
  for (const r of samples.rows) {
    console.log(`  ${r.total_score} pts — ${r.name}`);
    const breakdown = r.score_breakdown as Record<string, { points: number; reason: string }>;
    if (breakdown && Object.keys(breakdown).length > 0) {
      for (const [key, val] of Object.entries(breakdown)) {
        console.log(`    ${val.points > 0 ? '+' : ''}${val.points} ${val.reason}`);
      }
    }
  }
}

main().catch(console.error);
