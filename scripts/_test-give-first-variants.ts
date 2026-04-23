// Test alle 3 give-first varianten naast elkaar voor 1 lead met audit data.
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq, isNotNull, and, or } = await import('drizzle-orm');
  const { generateOutreachPrompt } = await import('../src/lib/ai/prompts');
  const { getToneForNace } = await import('../src/lib/ai/tone');
  const { getAIProvider } = await import('../src/lib/ai/provider');
  const { sanitizeVariant } = await import('../src/lib/ai/sanitize');

  // Pak een lead MET volledige audit data (anders kunnen geo_rapport bullets nergens op steunen)
  const candidates = await db
    .select({
      business: schema.businesses,
      audit: schema.auditResults,
    })
    .from(schema.businesses)
    .innerJoin(schema.auditResults, eq(schema.auditResults.businessId, schema.businesses.id))
    .where(
      and(
        or(
          isNotNull(schema.auditResults.pagespeedMobileScore),
          isNotNull(schema.auditResults.hasSsl),
          isNotNull(schema.auditResults.isMobileResponsive),
          isNotNull(schema.auditResults.hasGoogleAnalytics),
        ),
        isNotNull(schema.businesses.naceCode),
      ),
    )
    .limit(50);

  if (candidates.length === 0) {
    console.error('Geen lead met volledige audit data gevonden');
    process.exit(1);
  }

  // Pak liefst eentje met zwakke audit (meer materiaal voor geo_rapport)
  const pick =
    candidates.find(
      (c) =>
        (c.audit.pagespeedMobileScore ?? 100) < 70 ||
        c.audit.hasSsl === false ||
        c.audit.isMobileResponsive === false ||
        c.audit.hasGoogleAnalytics === false,
    ) ?? candidates[0];

  const { business, audit } = pick;

  console.log('=== LEAD ===');
  console.log(business.name, '|', business.city, '| NACE:', business.naceCode, business.naceDescription);
  console.log('Website:', business.website);
  console.log('Reviews:', business.googleReviewCount, '@', business.googleRating, '⭐');
  console.log();
  console.log('=== AUDIT FINDINGS ===');
  console.log('PageSpeed mobile:', audit.pagespeedMobileScore);
  console.log('PageSpeed desktop:', audit.pagespeedDesktopScore);
  console.log('SSL:', audit.hasSsl);
  console.log('Mobile responsive:', audit.isMobileResponsive);
  console.log('Google Analytics:', audit.hasGoogleAnalytics);
  console.log('Structured data:', audit.hasStructuredData);
  console.log('CMS:', audit.detectedCms);
  console.log();

  const baseCtx = {
    bedrijfsnaam: business.name,
    sector: business.sector,
    stad: business.city,
    naceCode: business.naceCode,
    naceDescription: business.naceDescription,
    website: business.website,
    googleRating: business.googleRating,
    googleReviewCount: business.googleReviewCount,
    auditFindings: {
      pagespeedMobile: audit.pagespeedMobileScore,
      pagespeedDesktop: audit.pagespeedDesktopScore,
      hasSsl: audit.hasSsl,
      detectedCms: audit.detectedCms,
      hasGoogleAnalytics: audit.hasGoogleAnalytics,
      isMobileResponsive: audit.isMobileResponsive,
      hasStructuredData: audit.hasStructuredData,
    },
    scoreBreakdown: {},
    totalScore: 65,
    eerdereOutreach: [],
    toon: getToneForNace(business.naceCode),
    kanaal: 'email' as const,
  };

  const provider = getAIProvider();
  const variants = ['control', 'geo_rapport', 'concurrent_vergelijking'] as const;

  for (const v of variants) {
    console.log('\n\n████████████████████████████████████████████████████████');
    console.log('█  VARIANT:', v);
    console.log('████████████████████████████████████████████████████████\n');

    const ctx = { ...baseCtx, giveFirstVariant: v };
    const { system, user } = generateOutreachPrompt(ctx);
    const response = await provider.generateText(system, user);

    let txt = response.text.trim();
    if (txt.startsWith('```')) txt = txt.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    try {
      const parsed = JSON.parse(txt);
      for (const raw of parsed) {
        const variant = sanitizeVariant(raw);
        // Detecteer em/en-dash in raw output zodat we weten of sanitize iets gestript heeft
        const rawJoined = `${raw.subject ?? ''} ${raw.body ?? ''} ${raw.ps ?? ''}`;
        const hadEmDash = /—|–/.test(rawJoined);

        console.log('--- Tone:', variant.tone, '---');
        console.log('Subject:', JSON.stringify(variant.subject));
        console.log('Preview:', JSON.stringify(variant.previewText));
        console.log('Body:');
        console.log(variant.body);
        console.log('PS:', JSON.stringify(variant.ps));
        if (hadEmDash) console.log('⚠ em/en-dash gestript door sanitize');
        console.log();
      }
    } catch (e) {
      console.log('Parse failed:', (e as Error).message);
      console.log('RAW:', response.text);
    }

    console.log('tokens:', response.usage.promptTokens, '→', response.usage.completionTokens);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
