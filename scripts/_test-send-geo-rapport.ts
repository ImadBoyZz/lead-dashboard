// End-to-end test: genereer geo_rapport mail voor Amigo Cars (echte audit data),
// verstuur via Resend naar bardid.imad@gmail.com.
// Test: nieuwe P1.3/P1.4 prompts → sanitize → Resend → pixel tracking.
import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

const AMIGO_CARS_ID_HINT = 'amigocars'; // match in email
const TEST_RECIPIENT = 'bardid.imad@gmail.com';

(async () => {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/lib/db/schema');
  const { eq, like } = await import('drizzle-orm');
  const { generateOutreachPrompt } = await import('../src/lib/ai/prompts');
  const { getToneForNace } = await import('../src/lib/ai/tone');
  const { getAIProvider } = await import('../src/lib/ai/provider');
  const { sanitizeVariant } = await import('../src/lib/ai/sanitize');
  const { sendOutreachEmail } = await import('../src/lib/email/send');
  const { randomUUID } = await import('node:crypto');

  // ── Zoek Amigo Cars ──────────────────────────────────
  const [amigo] = await db
    .select()
    .from(schema.businesses)
    .where(like(schema.businesses.email, `%${AMIGO_CARS_ID_HINT}%`))
    .limit(1);
  if (!amigo) {
    console.error('Amigo Cars niet gevonden.');
    process.exit(1);
  }
  console.log(`Bron-lead: ${amigo.name} (${amigo.city}, NACE ${amigo.naceCode})`);
  console.log(`  echte email: ${amigo.email} (wordt NIET gebruikt)`);
  console.log(`  test recipient: ${TEST_RECIPIENT}`);

  const audit = await db.query.auditResults.findFirst({
    where: eq(schema.auditResults.businessId, amigo.id),
  });
  const score = await db.query.leadScores.findFirst({
    where: eq(schema.leadScores.businessId, amigo.id),
  });

  console.log(`\nAudit: cms=${audit?.detectedCms} ssl=${audit?.hasSsl} ga=${audit?.hasGoogleAnalytics}`);
  console.log(`Score: ${score?.totalScore ?? 'N/A'}`);

  // ── Genereer mail met geo_rapport variant ──────────────
  const toon = getToneForNace(amigo.naceCode);
  const context = {
    bedrijfsnaam: amigo.name,
    sector: amigo.sector,
    stad: amigo.city,
    street: amigo.street,
    naceCode: amigo.naceCode,
    naceDescription: amigo.naceDescription,
    website: amigo.website,
    googleRating: amigo.googleRating,
    googleReviewCount: amigo.googleReviewCount,
    auditFindings: {
      pagespeedMobile: audit?.pagespeedMobileScore ?? null,
      pagespeedDesktop: audit?.pagespeedDesktopScore ?? null,
      hasSsl: audit?.hasSsl ?? null,
      detectedCms: audit?.detectedCms ?? null,
      hasGoogleAnalytics: audit?.hasGoogleAnalytics ?? null,
      isMobileResponsive: audit?.isMobileResponsive ?? null,
      hasStructuredData: audit?.hasStructuredData ?? null,
    },
    scoreBreakdown: (score?.scoreBreakdown ?? {}) as Record<string, { points: number; reason: string }>,
    totalScore: score?.totalScore ?? 0,
    eerdereOutreach: [],
    toon,
    kanaal: 'email' as const,
    giveFirstVariant: 'geo_rapport' as const,
  };

  const provider = getAIProvider();
  const { system, user } = generateOutreachPrompt(context);
  console.log(`\n→ AI call (${provider.modelName})...`);
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

  if (variants.length === 0) {
    console.error('AI gaf geen parseable variants terug. Raw:', response.text.slice(0, 400));
    process.exit(1);
  }

  // Pak de eerste variant (directe-observatie). Laat user andere kiezen als hij wil.
  const raw = variants[0];
  const v = sanitizeVariant(raw);

  const subject = v.subject ?? 'site van amigo cars';
  const body = `${v.body}\n\n${v.ps ? 'P.S. ' + v.ps + '\n\n' : ''}Imad`;

  console.log('\n──── DRAFT PREVIEW ────');
  console.log('Subject:', JSON.stringify(subject));
  console.log('Preview:', JSON.stringify(raw.previewText));
  console.log('Body:');
  console.log(body);
  console.log('\nTokens: in=' + response.usage.promptTokens + ' out=' + response.usage.completionTokens);
  console.log(`\n→ Verzenden naar ${TEST_RECIPIENT}...`);

  // ── Pre-insert outreach_log zodat pixel-tracking werkt ──────────
  const outreachLogId = randomUUID();
  await db.insert(schema.outreachLog).values({
    id: outreachLogId,
    businessId: amigo.id,
    channel: 'email',
    subject,
    content: body,
    aiGenerated: true,
    contactedAt: new Date(),
  });

  // ── Verstuur via Resend (bypass pipeline) ──────────────
  try {
    const result = await sendOutreachEmail({
      to: TEST_RECIPIENT,
      subject,
      body,
      businessId: amigo.id,
      outreachLogId,
    });
    console.log('\n✓ VERZONDEN');
    console.log('  Resend message id:', result.messageId);
    console.log('  outreachLogId:', outreachLogId);
    console.log('  Unsubscribe URL:', result.unsubscribeUrl);
    console.log('\nCheck in je Gmail:');
    console.log('  1. Mail komt in hoofdinbox (niet spam)');
    console.log('  2. Afzender: "Imad Bardid <imad@averissolutions.be>"');
    console.log('  3. Show original → SPF=PASS, DKIM=PASS, DMARC=PASS');
    console.log('  4. Open mail → pixel fire (check outreach_log.opened_at over ~1 min)');
    console.log('  5. Bekijk mail content: NIEUWE prompts (P1.3/P1.4) — opener=audit obs, geen "ik help X"');
  } catch (err) {
    console.error('\n✗ Verzend fout:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
