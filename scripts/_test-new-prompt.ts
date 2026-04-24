// Test nieuwe AI-gen prompt tegen echte lead data.
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { generateOutreachPrompt } = await import('../src/lib/ai/prompts');
  const { getToneForNace } = await import('../src/lib/ai/tone');
  const { getAIProvider } = await import('../src/lib/ai/provider');

  // Pick PMA Elektriciteit — bouw-cluster, heeft website
  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.id, '86b61357-5637-49e8-80c5-874161dd669d')) // Enova Solar als test
    .limit(1);

  if (!business) {
    console.error('Lead niet gevonden');
    process.exit(1);
  }

  console.log('=== LEAD ===');
  console.log(business.name, '|', business.naceDescription, '| NACE:', business.naceCode);
  console.log('Website:', business.website);
  console.log();

  const ctx = {
    bedrijfsnaam: business.name,
    sector: business.sector,
    stad: business.city,
    street: business.street,
    naceCode: business.naceCode,
    naceDescription: business.naceDescription,
    website: business.website,
    googleRating: business.googleRating,
    googleReviewCount: business.googleReviewCount,
    auditFindings: {
      pagespeedMobile: null,
      pagespeedDesktop: null,
      hasSsl: null,
      detectedCms: null,
      hasGoogleAnalytics: null,
      isMobileResponsive: null,
      hasStructuredData: null,
    },
    scoreBreakdown: {},
    totalScore: 65,
    eerdereOutreach: [],
    toon: getToneForNace(business.naceCode),
    kanaal: 'email' as const,
  };

  const { system, user } = generateOutreachPrompt(ctx);
  console.log('=== SYSTEM PROMPT (laatste 400 chars) ===');
  console.log(system.slice(-400));
  console.log();
  console.log('=== CALLING AI ===');

  const provider = getAIProvider();
  const response = await provider.generateText(system, user);

  console.log('=== RAW OUTPUT ===');
  console.log(response.text);
  console.log();

  try {
    let txt = response.text.trim();
    if (txt.startsWith('```')) txt = txt.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(txt);
    console.log('=== PARSED ===');
    for (const v of parsed) {
      console.log('\n--- Variant:', v.tone, '---');
      console.log('Subject:', JSON.stringify(v.subject));
      console.log('Preview:', JSON.stringify(v.previewText));
      console.log('Body (', (v.body ?? '').length, 'chars):');
      console.log(v.body);
      console.log('PS:', JSON.stringify(v.ps));
    }
  } catch (e) {
    console.log('Parse failed:', (e as Error).message);
  }

  console.log('\n=== USAGE ===');
  console.log('tokens in:', response.usage.promptTokens, 'out:', response.usage.completionTokens);
})().catch((e) => { console.error(e); process.exit(1); });
