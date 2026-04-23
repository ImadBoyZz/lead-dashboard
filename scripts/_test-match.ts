import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { matchKboEnterprise } = await import('../src/lib/kbo/matcher');
  const { normalizeBusinessName, extractPostcodeFromAddress } = await import('../src/lib/kbo/normalize');

  const tests = [
    { name: 'Stevens F. Bv', street: 'Bredestraat 68, 9041 Gent, Belgium' },
    { name: 'SOLLED Aalst', street: 'Ninovesteenweg 104, 9320 Aalst, Belgium' },
    { name: 'Moens sanitair & centrale verwarming B.V', street: 'Something 10, 9310 Aalst, Belgium' },
    { name: 'Vadi CV & Sanitair', street: 'Gasmeterlaan 160, 9000 Gent, Belgium' },
  ];
  for (const t of tests) {
    const postcode = extractPostcodeFromAddress(t.street);
    const norm = normalizeBusinessName(t.name);
    const result = await matchKboEnterprise({ name: t.name, postalCode: postcode });
    console.log(`${t.name}`);
    console.log(`  norm="${norm}" zip=${postcode}`);
    console.log(`  result=${result ? JSON.stringify(result, null, 2).replace(/\n/g,'\n  ') : 'null'}`);
    console.log();
  }
})().catch(e => { console.error(e); process.exit(1); });
