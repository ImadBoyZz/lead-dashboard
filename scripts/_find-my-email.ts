import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const leads = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.email, 'bardid.imad@gmail.com'));
  console.log(`\n=== Leads met email = bardid.imad@gmail.com: ${leads.length} ===\n`);
  for (const l of leads) {
    console.log(`id: ${l.id}`);
    console.log(`  name: ${l.name}`);
    console.log(`  city: ${l.city}`);
    console.log(`  nace: ${l.naceCode} (${l.naceDescription})`);
    console.log(`  emailStatus: ${l.emailStatus}`);
    console.log(`  optOut: ${l.optOut}, blacklisted: ${l.blacklisted}`);
    console.log(`  dataSource: ${l.dataSource}, registry: ${l.registryId}`);
    console.log(``);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
