import { type Tone, getToneInstruction } from './tone';

// ── Shared context types ──────────────────────────────

export interface OutreachContext {
  bedrijfsnaam: string;
  sector: string | null;
  stad: string | null;
  naceDescription: string | null;
  website: string | null;
  auditFindings: {
    pagespeedMobile: number | null;
    pagespeedDesktop: number | null;
    hasSsl: boolean | null;
    detectedCms: string | null;
    hasGoogleAnalytics: boolean | null;
    isMobileResponsive: boolean | null;
    hasStructuredData: boolean | null;
  };
  scoreBreakdown: Record<string, { points: number; reason: string }>;
  totalScore: number;
  eerdereOutreach: { channel: string; outcome: string | null }[];
  toon: Tone;
  kanaal: 'email' | 'phone';
}

export interface FollowUpContext {
  bedrijfsnaam: string;
  sector: string | null;
  stad: string | null;
  naceCode: string | null;
  laatsteOutreach: {
    channel: string;
    subject: string | null;
    content: string | null;
    outcome: string | null;
    structuredOutcome: string | null;
    contactedAt: string;
  };
  alleOutreach: { channel: string; outcome: string | null; contactedAt: string }[];
  leadTemperature: string;
  outreachCount: number;
  toon: Tone;
}

export interface InsightsData {
  sectorStats: { sector: string; channel: string; total: number; conversions: number; rate: number }[];
  topTemplates: { templateId: string; name: string; successCount: number }[];
  rejectionReasons: { reason: string; count: number }[];
  totalFeedback: number;
}

// ── Prompt generators ─────────────────────────────────

export function generateOutreachPrompt(ctx: OutreachContext): { system: string; user: string } {
  const toonInstructie = getToneInstruction(ctx.toon);

  const system = `Je bent een ervaren sales copywriter voor een Belgisch web agency (Averis Solutions).
Je schrijft UITSLUITEND in het Nederlands (Belgisch/Vlaams).
${toonInstructie}

REGELS:
- Schrijf ALLEEN in het Nederlands
- Geen Engelse woorden tenzij het technische termen zijn (SSL, PageSpeed, CMS)
- Wees specifiek over het bedrijf — gebruik hun naam, sector en locatie
- Verwijs naar concrete audit-bevindingen als die beschikbaar zijn
- Houd berichten kort en to-the-point (max 150 woorden per bericht)
- Geen overdreven beloftes of slijmerig taalgebruik
- Focus op het probleem dat je oplost, niet op jezelf

OUTPUT: Antwoord UITSLUITEND als een JSON array met exact 3 varianten:
${ctx.kanaal === 'email' ? '[{"subject": "...", "body": "..."}, ...]' : '[{"body": "..."}, ...]'}
Geen markdown, geen uitleg, enkel de JSON array.`;

  const auditInfo = ctx.auditFindings.pagespeedMobile !== null
    ? `\nAudit bevindingen:
- PageSpeed Mobile: ${ctx.auditFindings.pagespeedMobile}/100
- PageSpeed Desktop: ${ctx.auditFindings.pagespeedDesktop}/100
- SSL: ${ctx.auditFindings.hasSsl ? 'Ja' : 'Nee'}
- CMS: ${ctx.auditFindings.detectedCms ?? 'Onbekend'}
- Google Analytics: ${ctx.auditFindings.hasGoogleAnalytics ? 'Ja' : 'Nee'}
- Mobiel responsief: ${ctx.auditFindings.isMobileResponsive ? 'Ja' : 'Nee'}
- Structured Data: ${ctx.auditFindings.hasStructuredData ? 'Ja' : 'Nee'}`
    : '\nGeen audit data beschikbaar.';

  const scoreInfo = Object.entries(ctx.scoreBreakdown)
    .map(([key, val]) => `- ${key}: ${val.points} punten (${val.reason})`)
    .join('\n');

  const outreachHistory = ctx.eerdereOutreach.length > 0
    ? `\nEerdere contactmomenten:\n${ctx.eerdereOutreach.map((o) => `- ${o.channel}: ${o.outcome ?? 'geen uitkomst'}`).join('\n')}`
    : '\nGeen eerder contact.';

  const user = `Genereer 3 ${ctx.kanaal === 'email' ? 'email' : 'telefonische gespreksscript'} varianten voor:

Bedrijf: ${ctx.bedrijfsnaam}
Sector: ${ctx.naceDescription ?? ctx.sector ?? 'Onbekend'}
Locatie: ${ctx.stad ?? 'Onbekend'}
Website: ${ctx.website ?? 'Geen website'}
Lead Score: ${ctx.totalScore}/100
${auditInfo}

Score breakdown:
${scoreInfo || 'Geen score details.'}
${outreachHistory}

Kanaal: ${ctx.kanaal}
${ctx.kanaal === 'phone' ? 'Schrijf een gesprekscript (geen subject nodig). Begin met een introductie en eindig met een call-to-action.' : 'Schrijf een email met subject en body.'}`;

  return { system, user };
}

export function generateFollowUpPrompt(ctx: FollowUpContext): { system: string; user: string } {
  const toonInstructie = getToneInstruction(ctx.toon);

  const system = `Je bent een sales strategie adviseur voor een Belgisch web agency (Averis Solutions).
Je geeft advies UITSLUITEND in het Nederlands.
${toonInstructie}

Analyseer de situatie en suggereer de beste volgende stap.

OUTPUT: Antwoord UITSLUITEND als JSON object:
{"suggestedAction": "...", "suggestedChannel": "email|phone|linkedin", "suggestedDays": 1-14, "draftMessage": "...", "reasoning": "..."}
Geen markdown, geen uitleg, enkel het JSON object.`;

  const outreachHistory = ctx.alleOutreach
    .map((o) => `- ${o.channel} (${o.contactedAt}): ${o.outcome ?? 'geen uitkomst'}`)
    .join('\n');

  const user = `Analyseer deze lead en suggereer de volgende actie:

Bedrijf: ${ctx.bedrijfsnaam}
Sector: ${ctx.sector ?? 'Onbekend'}
Locatie: ${ctx.stad ?? 'Onbekend'}
Lead temperatuur: ${ctx.leadTemperature}
Aantal contactmomenten: ${ctx.outreachCount}

Laatste contact:
- Kanaal: ${ctx.laatsteOutreach.channel}
- Datum: ${ctx.laatsteOutreach.contactedAt}
- Onderwerp: ${ctx.laatsteOutreach.subject ?? 'N/A'}
- Uitkomst: ${ctx.laatsteOutreach.structuredOutcome ?? ctx.laatsteOutreach.outcome ?? 'Onbekend'}

Alle contactmomenten:
${outreachHistory || 'Geen eerdere contactmomenten.'}

Suggereer de beste volgende stap: welk kanaal, wanneer, en een concept bericht.`;

  return { system, user };
}

export function generateInsightsPrompt(data: InsightsData): { system: string; user: string } {
  const system = `Je bent een data-analist voor een Belgisch web agency (Averis Solutions).
Je analyseert outreach resultaten en geeft inzichten UITSLUITEND in het Nederlands.

OUTPUT: Antwoord UITSLUITEND als JSON array met 3-5 inzichten:
[{"pattern": "...", "metric": "...", "recommendation": "..."}, ...]
Geen markdown, geen uitleg, enkel de JSON array.`;

  const sectorStats = data.sectorStats
    .map((s) => `- ${s.sector} via ${s.channel}: ${s.conversions}/${s.total} conversies (${Math.round(s.rate * 100)}%)`)
    .join('\n');

  const topTemplates = data.topTemplates
    .map((t) => `- ${t.name}: ${t.successCount} successen`)
    .join('\n');

  const rejections = data.rejectionReasons
    .map((r) => `- ${r.reason}: ${r.count}x`)
    .join('\n');

  const user = `Analyseer deze outreach data (${data.totalFeedback} resultaten) en geef 3-5 inzichten:

Conversie per sector + kanaal:
${sectorStats || 'Geen data.'}

Top templates:
${topTemplates || 'Geen template data.'}

Afwijzingsredenen:
${rejections || 'Geen afwijzingen.'}

Geef patronen, metrics en aanbevelingen in het Nederlands.`;

  return { system, user };
}
