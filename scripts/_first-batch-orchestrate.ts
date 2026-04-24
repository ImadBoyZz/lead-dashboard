// Orchestreer eerste echte batch:
//   1. SELECT top 5 leads (VL KMO, target NACE cluster, audit beschikbaar, all gates)
//   2. INSERT experiment "Warmup Week 0-4: GEO-rapport baseline" (of hergebruik bestaande)
//   3. Genereer 2 drafts per lead (tone-varianten) via zelfde pad als /api/ai/generate/batch
//   4. INSERT in outreach_drafts, status blijft pending tot review approve
//
// Stopt NA draft-generatie. sendEnabled blijft ongewijzigd. User approved op /review.
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { and, eq, inArray, isNotNull, not, or, sql, desc } = await import('drizzle-orm');
  const { generateOutreachPrompt } = await import('../src/lib/ai/prompts');
  const { getToneForNace } = await import('../src/lib/ai/tone');
  const { getAIProvider } = await import('../src/lib/ai/provider');
  const { sanitizeVariant } = await import('../src/lib/ai/sanitize');
  const { assignVariantForLead } = await import('../src/lib/ai/variant-assignment');
  const { alreadyContactedRecently } = await import('../src/lib/dedup');
  const { ACTIVE_DEAL_STAGES } = await import('../src/lib/pipeline-logic');
  const { randomUUID } = await import('crypto');

  const TARGET_COUNT = 5;

  // ── Stap 1: top leads ophalen ────────────────────────────
  console.log('\n=== STAP 1: lead selectie ===\n');

  const candidates = await db
    .select({
      id: schema.businesses.id,
      name: schema.businesses.name,
      city: schema.businesses.city,
      postalCode: schema.businesses.postalCode,
      naceCode: schema.businesses.naceCode,
      naceDescription: schema.businesses.naceDescription,
      email: schema.businesses.email,
      emailStatus: schema.businesses.emailStatus,
      website: schema.businesses.website,
      googleRating: schema.businesses.googleRating,
      googleReviewCount: schema.businesses.googleReviewCount,
      websiteVerdict: schema.businesses.websiteVerdict,
      chainClassification: schema.businesses.chainClassification,
      businessActivityStatus: schema.businesses.businessActivityStatus,
      totalScore: schema.leadScores.totalScore,
      maturityCluster: schema.leadScores.maturityCluster,
      pipelineStage: schema.leadPipeline.stage,
      frozen: schema.leadPipeline.frozen,
      disqualified: schema.leadScores.disqualified,
      hasAudit: schema.auditResults.id,
    })
    .from(schema.businesses)
    .innerJoin(schema.leadPipeline, eq(schema.leadPipeline.businessId, schema.businesses.id))
    .innerJoin(schema.leadScores, eq(schema.leadScores.businessId, schema.businesses.id))
    .innerJoin(schema.auditResults, eq(schema.auditResults.businessId, schema.businesses.id))
    .where(
      and(
        eq(schema.businesses.country, 'BE'),
        // Vlaamse postcodes: 1000-3999 of 8000-9999
        or(
          sql`${schema.businesses.postalCode} BETWEEN '1000' AND '3999'`,
          sql`${schema.businesses.postalCode} BETWEEN '8000' AND '9999'`,
        ),
        // Target NACE clusters: horeca(56), kappers(9602), auto(45), bouw(41/42/43), retail(47)
        or(
          sql`${schema.businesses.naceCode} LIKE '56%'`,
          sql`${schema.businesses.naceCode} LIKE '9602%'`,
          sql`${schema.businesses.naceCode} LIKE '45%'`,
          sql`${schema.businesses.naceCode} LIKE '41%'`,
          sql`${schema.businesses.naceCode} LIKE '42%'`,
          sql`${schema.businesses.naceCode} LIKE '43%'`,
          sql`${schema.businesses.naceCode} LIKE '47%'`,
        ),
        isNotNull(schema.businesses.email),
        inArray(schema.businesses.emailStatus, ['smtp_valid', 'mx_valid']),
        eq(schema.businesses.optOut, false),
        eq(schema.businesses.blacklisted, false),
        or(
          sql`${schema.businesses.businessActivityStatus} IS NULL`,
          inArray(schema.businesses.businessActivityStatus, ['active', 'uncertain']),
        ),
        or(
          sql`${schema.businesses.chainClassification} IS NULL`,
          not(inArray(schema.businesses.chainClassification, ['chain', 'corporate'])),
        ),
        or(
          sql`${schema.businesses.websiteVerdict} IS NULL`,
          not(eq(schema.businesses.websiteVerdict, 'modern')),
        ),
        eq(schema.leadPipeline.stage, 'new'),
        eq(schema.leadPipeline.frozen, false),
        eq(schema.leadScores.disqualified, false),
      ),
    )
    .orderBy(desc(schema.leadScores.totalScore))
    .limit(30); // ruime buffer — dedup-gate kan er nog uit halen

  console.log(`Initiële kandidaten: ${candidates.length}`);
  if (candidates.length === 0) {
    console.error('Geen leads passen filters. Abort.');
    process.exit(1);
  }

  // Filter: dedup + active-deal gate
  const filtered: typeof candidates = [];
  for (const c of candidates) {
    if (filtered.length >= TARGET_COUNT) break;
    const dedup = await alreadyContactedRecently(c.id);
    if (dedup.contacted) {
      console.log(`  skip ${c.name} — ${dedup.reason}`);
      continue;
    }
    if (ACTIVE_DEAL_STAGES.includes(c.pipelineStage as never)) {
      console.log(`  skip ${c.name} — actieve deal (${c.pipelineStage})`);
      continue;
    }
    filtered.push(c);
  }

  if (filtered.length < TARGET_COUNT) {
    console.warn(`⚠ Maar ${filtered.length} leads overblijvend na dedup/deal-gates (target was ${TARGET_COUNT}).`);
  }

  console.log('\nGeselecteerde leads:');
  console.table(
    filtered.map((l) => ({
      id: l.id.slice(0, 8) + '…',
      name: l.name,
      city: l.city,
      nace: l.naceCode,
      score: l.totalScore,
      emailStatus: l.emailStatus,
      reviews: l.googleReviewCount,
      rating: l.googleRating,
    })),
  );

  // ── Stap 2: experiment row ────────────────────────────────
  console.log('\n=== STAP 2: experiment row ===\n');

  const experimentName = 'Warmup Week 0-4: GEO-rapport baseline';
  const [existing] = await db
    .select()
    .from(schema.experiments)
    .where(and(eq(schema.experiments.name, experimentName), eq(schema.experiments.status, 'running')))
    .limit(1);

  let experimentId: string;
  if (existing) {
    experimentId = existing.id;
    console.log(`Hergebruik bestaand experiment: ${experimentId}`);
  } else {
    const [inserted] = await db
      .insert(schema.experiments)
      .values({
        name: experimentName,
        testVariant: 'geo_rapport',
        controlVariant: 'geo_rapport',
        splitPercentage: 100,
        hypothesis: 'GEO-rapport haalt 3%+ positive reply rate bij VL KMOs',
        expectedReplyRate: '0.030',
        minSampleSize: 1000,
        targetSends: 500,
        startsAt: new Date(),
        status: 'running',
      })
      .returning({ id: schema.experiments.id });
    experimentId = inserted.id;
    console.log(`✓ Experiment aangemaakt: ${experimentId}`);
  }

  // ── Stap 3: drafts genereren ──────────────────────────────
  console.log('\n=== STAP 3: drafts genereren ===\n');

  const provider = getAIProvider();
  const campaignId = randomUUID();
  console.log(`Campaign ID: ${campaignId}`);
  console.log(`Experiment: ${experimentId}`);
  console.log(`Leads: ${filtered.length}\n`);

  const results: {
    lead: string;
    draftIds: string[];
    subjects: string[];
    variant: string;
    tokens: { in: number; out: number };
    bodies: string[];
    pses: string[];
  }[] = [];

  for (const lead of filtered) {
    console.log(`\n--- ${lead.name} (${lead.city}) ---`);

    const audit = await db.query.auditResults.findFirst({
      where: eq(schema.auditResults.businessId, lead.id),
    });
    const score = await db.query.leadScores.findFirst({
      where: eq(schema.leadScores.businessId, lead.id),
    });

    const toon = getToneForNace(lead.naceCode);
    const scoreBreakdown = (score?.scoreBreakdown ?? {}) as Record<string, { points: number; reason: string }>;

    const giveFirstVariant = assignVariantForLead({
      businessId: lead.id,
      experimentId,
      splitPercentage: 100,
      testVariant: 'geo_rapport',
      controlVariant: 'geo_rapport',
    });

    const businessFull = await db.query.businesses.findFirst({ where: eq(schema.businesses.id, lead.id) });
    if (!businessFull) continue;

    const context = {
      bedrijfsnaam: businessFull.name,
      sector: businessFull.sector,
      stad: businessFull.city,
      street: businessFull.street,
      naceCode: businessFull.naceCode,
      naceDescription: businessFull.naceDescription,
      website: businessFull.website,
      googleRating: businessFull.googleRating,
      googleReviewCount: businessFull.googleReviewCount,
      auditFindings: {
        pagespeedMobile: audit?.pagespeedMobileScore ?? null,
        pagespeedDesktop: audit?.pagespeedDesktopScore ?? null,
        hasSsl: audit?.hasSsl ?? null,
        detectedCms: audit?.detectedCms ?? null,
        hasGoogleAnalytics: audit?.hasGoogleAnalytics ?? null,
        isMobileResponsive: audit?.isMobileResponsive ?? null,
        hasStructuredData: audit?.hasStructuredData ?? null,
      },
      scoreBreakdown,
      totalScore: score?.totalScore ?? 0,
      eerdereOutreach: [],
      toon,
      kanaal: 'email' as const,
      giveFirstVariant,
    };

    const { system, user } = generateOutreachPrompt(context);
    const response = await provider.generateText(system, user, { maxTokens: 1024 });

    let text = response.text.trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    let variants: { subject?: string; body: string; ps?: string; tone?: string }[] = [];
    try {
      const parsed = JSON.parse(text);
      variants = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      const m = text.match(/\[[\s\S]*\]/);
      if (m) variants = JSON.parse(m[0]);
    }

    const draftIds: string[] = [];
    const subjects: string[] = [];
    const bodies: string[] = [];
    const pses: string[] = [];

    for (let i = 0; i < Math.min(variants.length, 2); i++) {
      const raw = variants[i];
      if (!raw?.body) continue;
      const v = sanitizeVariant(raw);
      try {
        const [inserted] = await db
          .insert(schema.outreachDrafts)
          .values({
            businessId: lead.id,
            campaignId,
            channel: 'email',
            subject: v.subject ?? null,
            body: v.body,
            tone: toon,
            aiProvider: provider.providerName,
            aiModel: provider.modelName,
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            variantIndex: i,
            experimentId,
            giveFirstVariant,
          })
          .returning({ id: schema.outreachDrafts.id });
        draftIds.push(inserted.id);
        subjects.push(v.subject ?? '(geen subject)');
        bodies.push(v.body);
        pses.push(v.ps ?? '');
        console.log(`  ✓ variant ${i} saved: ${inserted.id.slice(0, 8)}… subj="${v.subject}"`);
      } catch (err) {
        const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
        if (code === '23505') {
          console.log(`  ⚠ variant ${i} already exists (skip)`);
        } else {
          throw err;
        }
      }
    }

    results.push({
      lead: `${lead.name} (${lead.city}, ${lead.naceDescription ?? lead.naceCode})`,
      draftIds,
      subjects,
      variant: giveFirstVariant,
      tokens: { in: response.usage.promptTokens, out: response.usage.completionTokens },
      bodies,
      pses,
    });
  }

  // ── Samenvatting ───────────────────────────────────────
  console.log('\n\n████████████████████████████████████████████████████████');
  console.log('█  KLAAR — drafts in DB, wacht op approve op /review');
  console.log('████████████████████████████████████████████████████████\n');

  console.log(`Experiment ID: ${experimentId}`);
  console.log(`Campaign ID:   ${campaignId}`);
  console.log(`Leads:         ${results.length}`);
  console.log(`Drafts:        ${results.reduce((a, r) => a + r.draftIds.length, 0)} (2 varianten per lead)\n`);

  console.log('──── DRAFT PREVIEWS ────\n');
  for (const r of results) {
    console.log(`\n▶ ${r.lead}`);
    console.log(`  variant: ${r.variant}`);
    for (let i = 0; i < r.draftIds.length; i++) {
      console.log(`\n  [variant_index ${i}] draft=${r.draftIds[i].slice(0, 8)}…`);
      console.log(`  subject: ${r.subjects[i]}`);
      console.log(`  body:`);
      console.log(r.bodies[i].split('\n').map((l) => '    ' + l).join('\n'));
      if (r.pses[i]) console.log(`  PS: ${r.pses[i]}`);
    }
  }

  const totalIn = results.reduce((a, r) => a + r.tokens.in, 0);
  const totalOut = results.reduce((a, r) => a + r.tokens.out, 0);
  console.log(`\nTokens: in=${totalIn} out=${totalOut}`);
  console.log(`\nVolgende stap: https://lead-dashboard-taupe.vercel.app/review — approve drafts, daarna sendEnabled flip.`);

  process.exit(0);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
