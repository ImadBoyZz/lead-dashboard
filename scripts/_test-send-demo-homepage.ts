// Test-send: control variant (demo-homepage pitch) naar bardid.imad@gmail.com.
// Gebruikt Amigo Cars context (Mobirise, geen SSL = pain angles).
// Override NEXT_PUBLIC_APP_URL naar prod zodat pixel + unsubscribe werken.

import { config } from 'dotenv';
import path from 'node:path';
config({ path: path.resolve(process.cwd(), '.env.local') });

// KRITIEK: override NA dotenv, VOOR dynamic imports van env.ts
// Anders lekken localhost links naar echte inboxes (zelfs naar jezelf blijft
// de pixel-tracking dan stuk).
process.env.NEXT_PUBLIC_APP_URL = 'https://lead-dashboard-taupe.vercel.app';

const AMIGO_CARS_HINT = 'amigocars';
const TEST_RECIPIENT = 'bardid.imad@gmail.com';
const VARIANT: 'control' | 'geo_rapport' | 'concurrent_vergelijking' = 'control';
const TONE_INDEX = 0; // 0 = directe observatie opener, 1 = vraag opener

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

  console.log(`NEXT_PUBLIC_APP_URL override: ${process.env.NEXT_PUBLIC_APP_URL}`);

  const [amigo] = await db
    .select()
    .from(schema.businesses)
    .where(like(schema.businesses.email, `%${AMIGO_CARS_HINT}%`))
    .limit(1);
  if (!amigo) {
    console.error('Amigo Cars niet gevonden.');
    process.exit(1);
  }

  const audit = await db.query.auditResults.findFirst({
    where: eq(schema.auditResults.businessId, amigo.id),
  });
  const score = await db.query.leadScores.findFirst({
    where: eq(schema.leadScores.businessId, amigo.id),
  });

  console.log(`Bron-lead: ${amigo.name} (${amigo.city})`);
  console.log(`  variant: ${VARIANT} (tone_index=${TONE_INDEX})`);
  console.log(`  test recipient: ${TEST_RECIPIENT}`);
  console.log(`  audit: cms=${audit?.detectedCms} ssl=${audit?.hasSsl} score=${score?.totalScore}`);

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
    giveFirstVariant: VARIANT,
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

  const raw = variants[TONE_INDEX] ?? variants[0];
  const v = sanitizeVariant(raw);
  // Strip trailing "?" uit subject — Gmail classifier correleert vraagteken
  // met promotional content. Betere Primary-tab placement zonder.
  const subject = (v.subject ?? 'vraagje over jullie website').replace(/\?+\s*$/, '');
  // Voor demo_homepage variant (control): body bevat al "Groeten,\nImad"
  // signature. PS is altijd null. Geen extra append nodig.
  // Voor andere varianten (geo_rapport/concurrent_vergelijking): body eindigt
  // vóór signature, PS kan optional zijn, signature "Imad" moet worden
  // appended.
  const isDemoHomepage = VARIANT === 'control';
  const body = isDemoHomepage
    ? v.body
    : `${v.body}\n\n${v.ps ? 'P.S. ' + v.ps + '\n\n' : ''}Imad`;

  console.log('\n──── DRAFT PREVIEW ────');
  console.log('Subject:', JSON.stringify(subject));
  console.log('Preview:', JSON.stringify(raw.previewText));
  console.log('Body:');
  console.log(body);
  console.log(`\nTokens: in=${response.usage.promptTokens} out=${response.usage.completionTokens}`);

  // Pre-insert outreach_log row zodat pixel-tracking werkt.
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

  console.log(`\n→ Verzenden via Resend naar ${TEST_RECIPIENT} (plaintext-only, geen zichtbare footer)...`);
  const result = await sendOutreachEmail({
    to: TEST_RECIPIENT,
    subject,
    body,
    businessId: amigo.id,
    outreachLogId,
    plainTextOnly: true,
    footerStyle: 'none',
  });
  console.log('\n✓ VERZONDEN');
  console.log('  Resend message id:', result.messageId);
  console.log('  outreachLogId:', outreachLogId);
  console.log('  Unsubscribe URL:', result.unsubscribeUrl);

  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
