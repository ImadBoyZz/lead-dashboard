import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });
(async () => {
  const { findContactEmail } = await import('../src/lib/enrich/email-finder');
  const r = await findContactEmail({
    website: 'https://www.sandervervaet.be/',
    businessName: 'Sander Vervaet',
  });
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
