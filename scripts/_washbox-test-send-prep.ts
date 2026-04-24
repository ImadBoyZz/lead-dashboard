// Prep voor end-to-end test-send naar Wash Box (bardid.imad@gmail.com = Imad zelf).
// Stopt NA draft-generatie. User review draft, dan aparte script voor approve+send.
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const TARGET_EMAIL = 'bardid.imad@gmail.com'; // Imad's eigen Gmail — test-lead

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { and, eq, inArray, isNotNull, isNull, not, or, sql, count } = await import('drizzle-orm');
  const { generateOutreachPrompt } = await import('../src/lib/ai/prompts');
  const { getToneForNace } = await import('../src/lib/ai/tone');
  const { getAIProvider } = await import('../src/lib/ai/provider');
  const { sanitizeVariant } = await import('../src/lib/ai/sanitize');
  const { assignVariantForLead } = await import('../src/lib/ai/variant-assignment');
  const { getSetting } = await import('../src/lib/settings/system-settings');
  const { randomUUID } = await import('crypto');

  // ── Pre-check 1: sendEnabled state ─────────────────────
  console.log('\n=== PRE-CHECK ===\n');
  const sendEnabled = await getSetting('send_enabled');
  console.log(`send_enabled: ${sendEnabled} (OK — design state sinds 2026-04-23)`);
  // send_enabled=true is normal; worker pakt alleen approved drafts,
  // Wash Box draft blijft 'pending' tot expliciete approve.

  // ── Pre-check 2: andere approved drafts die mee zouden gaan ───────
  const approvedDrafts = await db
    .select({
      id: schema.outreachDrafts.id,
      businessId: schema.outreachDrafts.businessId,
      subject: schema.outreachDrafts.subject,
      businessName: schema.businesses.name,
      status: schema.outreachDrafts.status,
    })
    .from(schema.outreachDrafts)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.outreachDrafts.businessId))
    .where(eq(schema.outreachDrafts.status, 'approved'));
  console.log(`\nApproved drafts in queue: ${approvedDrafts.length}`);
  for (const d of approvedDrafts) {
    console.log(`  ${d.id.slice(0, 8)}… → ${d.businessName}: "${d.subject}"`);
  }
  if (approvedDrafts.length > 0) {
    console.error('\n⚠ Er zijn al approved drafts in de queue. Die zouden mee verzonden worden bij sendEnabled=true.');
    console.error('  Eerst die drafts reviewen/rejecten vóór we een test-send doen.');
    process.exit(1);
  }

  // ── Pre-check 3: Wash Box details ─────────────────────
  const [washBox] = await db
    .select()
    .from(schema.businesses)
    .where(and(
      eq(schema.businesses.email, TARGET_EMAIL),
      isNotNull(schema.businesses.email),
    ))
    .limit(1);
  if (!washBox) {
    console.error(`Lead met email ${TARGET_EMAIL} niet gevonden.`);
    process.exit(1);
  }
  const WASH_BOX_ID = washBox.id;
  console.log(`\nWash Box lead:`);
  console.log(`  id: ${washBox.id}`);
  console.log(`  name: ${washBox.name}`);
  console.log(`  city: ${washBox.city}`);
  console.log(`  email: ${washBox.email}`);
  console.log(`  email_status: ${washBox.emailStatus}`);
  console.log(`  nace: ${washBox.naceCode} (${washBox.naceDescription})`);
  console.log(`  opt_out: ${washBox.optOut}, blacklisted: ${washBox.blacklisted}`);

  if (washBox.optOut || washBox.blacklisted) {
    console.error(`⚠ opt_out=${washBox.optOut} blacklisted=${washBox.blacklisted}. Abort.`);
    process.exit(1);
  }

  // ── Pre-check 4: bestaande non-final drafts voor Wash Box ───────────
  const existing = await db
    .select({
      id: schema.outreachDrafts.id,
      status: schema.outreachDrafts.status,
      createdAt: schema.outreachDrafts.createdAt,
    })
    .from(schema.outreachDrafts)
    .where(and(
      eq(schema.outreachDrafts.businessId, WASH_BOX_ID),
      inArray(schema.outreachDrafts.status, ['pending', 'approved', 'sending']),
    ));
  console.log(`\nBestaande actieve Wash Box drafts: ${existing.length}`);
  for (const e of existing) {
    console.log(`  ${e.id.slice(0, 8)}… status=${e.status} created=${e.createdAt.toISOString()}`);
  }
  if (existing.length > 0) {
    console.error('\n⚠ Wash Box heeft al actieve drafts. Ruim eerst op of mark als rejected.');
    process.exit(1);
  }

  // ── Pipeline stage check ─────────────────────────────
  const [pipeline] = await db
    .select()
    .from(schema.leadPipeline)
    .where(eq(schema.leadPipeline.businessId, WASH_BOX_ID))
    .limit(1);
  console.log(`\nPipeline stage: ${pipeline?.stage ?? 'NO PIPELINE ROW'} | frozen=${pipeline?.frozen}`);

  // ── Audit data + score ─────────────────────────────
  const audit = await db.query.auditResults.findFirst({
    where: eq(schema.auditResults.businessId, WASH_BOX_ID),
  });
  const score = await db.query.leadScores.findFirst({
    where: eq(schema.leadScores.businessId, WASH_BOX_ID),
  });
  console.log(`\nAudit: ssl=${audit?.hasSsl} cms=${audit?.detectedCms} pagespeed=${audit?.pagespeedMobileScore} ga=${audit?.hasGoogleAnalytics}`);
  console.log(`Score: total=${score?.totalScore ?? 'N/A'} disqualified=${score?.disqualified}`);

  // ── Stap 2: experiment (reuse or insert) ─────────────
  console.log('\n=== STAP 2: experiment ===\n');
  const expName = 'Warmup Week 0-4: GEO-rapport baseline';
  const [existingExp] = await db
    .select()
    .from(schema.experiments)
    .where(and(eq(schema.experiments.name, expName), eq(schema.experiments.status, 'running')))
    .limit(1);

  let experimentId: string;
  if (existingExp) {
    experimentId = existingExp.id;
    console.log(`Hergebruik bestaand experiment: ${experimentId}`);
  } else {
    const [inserted] = await db
      .insert(schema.experiments)
      .values({
        name: expName,
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

  // ── Stap 3: genereer draft ─────────────────────────
  console.log('\n=== STAP 3: draft genereren ===\n');

  const provider = getAIProvider();
  const campaignId = randomUUID();
  const toon = getToneForNace(washBox.naceCode);
  const scoreBreakdown = (score?.scoreBreakdown ?? {}) as Record<string, { points: number; reason: string }>;

  const giveFirstVariant = assignVariantForLead({
    businessId: WASH_BOX_ID,
    experimentId,
    splitPercentage: 100,
    testVariant: 'geo_rapport',
    controlVariant: 'geo_rapport',
  });
  console.log(`Variant assigned: ${giveFirstVariant}`);

  const context = {
    bedrijfsnaam: washBox.name,
    sector: washBox.sector,
    stad: washBox.city,
    street: washBox.street,
    naceCode: washBox.naceCode,
    naceDescription: washBox.naceDescription,
    website: washBox.website,
    googleRating: washBox.googleRating,
    googleReviewCount: washBox.googleReviewCount,
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
  let variants: { subject?: string; body: string; ps?: string; tone?: string; previewText?: string }[] = [];
  try {
    const parsed = JSON.parse(text);
    variants = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) variants = JSON.parse(m[0]);
  }

  const draftIds: string[] = [];
  for (let i = 0; i < Math.min(variants.length, 2); i++) {
    const raw = variants[i];
    if (!raw?.body) continue;
    const v = sanitizeVariant(raw);
    const [inserted] = await db
      .insert(schema.outreachDrafts)
      .values({
        businessId: WASH_BOX_ID,
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
    console.log(`\n--- variant_index ${i} ---`);
    console.log(`draft id: ${inserted.id}`);
    console.log(`subject: ${v.subject}`);
    console.log(`preview: ${raw.previewText ?? ''}`);
    console.log(`body:\n${v.body}`);
    console.log(`PS: ${v.ps}`);
    console.log(`tone: ${raw.tone}`);
  }

  // ── Samenvatting ───────────────────────────────────
  console.log('\n\n████████████████████████████████████████████████████████');
  console.log('█  DRAFTS KLAAR — wacht op go/no-go');
  console.log('████████████████████████████████████████████████████████\n');
  console.log(`Experiment:  ${experimentId}`);
  console.log(`Campaign:    ${campaignId}`);
  console.log(`Target:      Wash Box → bardid.imad@gmail.com`);
  console.log(`Drafts:      ${draftIds.length}`);
  console.log(`Draft IDs:   ${draftIds.join(', ')}`);
  console.log(`\nTokens: in=${response.usage.promptTokens} out=${response.usage.completionTokens}`);
  console.log(`\nVolgende script (NA go): _washbox-test-send-approve-flip.ts <draft_id>`);

  process.exit(0);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
