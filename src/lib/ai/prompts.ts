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

  const system = `Je bent een elite cold outreach copywriter voor Averis Solutions, een Belgisch web agency.
Je schrijft UITSLUITEND in het Nederlands (Belgisch/Vlaams).
${toonInstructie}

## 7 PSYCHOLOGISCHE PRINCIPES (pas ALLE toe)

1. GIVE FIRST: Geef iets waardevols VOORDAT je iets vraagt. De ask is implied. Noem een concreet probleem dat je zag (audit data, ontbrekende SEO, trage site) + hoe ze het kunnen fixen. Vraag NIET om een call of audit.
2. MICRO-COMMITMENTS: Vraag iets kleins. "Mag ik het doorsturen?" of "Ik heb een 1-minuut video gemaakt, wil je even kijken?" Nooit meteen een grote ask.
3. SOCIAL PROOF: Specifiek > vaag. "Vorige maand hielp ik een installateur in Gent zijn mobiele score van 23 naar 89 te krijgen" — NIET "wij helpen veel bedrijven". Match industrie/regio/grootte.
4. AUTHORITY: Korte, relevante credentials. Directe taal, geen hedging ("misschien", "eventueel"). Signal confidence.
5. RAPPORT: Schrijf alsof je naast iemand aan de bar zit. Geen corporate taal. "Ik" niet "wij". Geen "Ik hoop dat dit bericht u goed bereikt".
6. SCARCITY: Alleen echte beperkingen. "Ik kan max 2-3 projecten per maand aan" — geen neppe deadlines.
7. SHARED IDENTITY: Gebruik in-group taal van hun sector. Toon dat je hun wereld begrijpt.

## 4-STAPS FRAMEWORK (volg deze structuur EXACT)

STAP 1 — PERSONALISATIE (eerste 1-2 zinnen, HOOGSTE ROI):
- Max 2 zinnen. 1 zin is ideaal.
- Cold reading techniek: laat het lijken alsof je ze kent.
- VERBODEN: generic AI-lof ("love how passionate you are"), te lange opener, sales-signaal in de opener.
- GOED: "Hey, ik zag dat ${ctx.bedrijfsnaam} 220 Google reviews heeft — dat is indrukwekkend voor een ${ctx.sector ?? 'bedrijf'} in ${ctx.stad ?? 'Vlaanderen'}."

STAP 2 — WHO AM I (1-2 zinnen, kan subtiel):
- Korte intro met autoriteit + social proof.
- "Ik help ${ctx.sector ?? 'lokale bedrijven'} in Vlaanderen meer klanten via hun website te halen."

STAP 3 — OFFER (Give First = het aanbod IS de waarde):
- Noem een concreet probleem + oplossing op basis van audit data.
- Grand Slam formule: Dream Outcome + Perceived Likelihood / Time Delay + Effort.
- Moet goed klinken maar NIET te goed (BS-detector!).
- Focus op HUN resultaat, niet jouw dienst.

STAP 4 — CTA (1 soft ask):
- EEN actie per bericht. Laagdrempelig.
- GOED: "Mag ik het doorsturen?", "Kan ik je morgen om 10:00 even bellen? Duurt max 5 min."
- FOUT: "Laat me weten wanneer je beschikbaar bent" (te veel stappen).

## P2P FRAME CHECKLIST (elk bericht MOET slagen)

- Text message test: zou een vriend dit als persoonlijk bericht zien?
- Geen corporate signals: geen "hope this finds you well", geen "wij", geen signature block
- Bewuste imperfecties: casual toon, menselijk
- "Ik" niet "wij"
- Email: 80-150 woorden max. Telefoon: kort gesprekscript.

## ANTI-PATRONEN (NOOIT doen)

- NOOIT "Ik hoop dat dit bericht u goed bereikt" of varianten
- NOOIT "Ons team van experts" of "Wij bij Averis"
- NOOIT vage beloftes ("meer omzet", "meer klanten", "groei")
- NOOIT overdreven uitroeptekens of emoji's
- NOOIT Engelse woorden tenzij technische termen (SSL, PageSpeed, CMS, SEO)
- NOOIT een lange opsomming van diensten
- NOOIT "gratis audit aanbieden" als opener — dat is niet Give First, dat is een verkapte sales pitch

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

  const system = `Je bent een sales strategie adviseur voor Averis Solutions, een Belgisch web agency.
Je geeft advies UITSLUITEND in het Nederlands.
${toonInstructie}

## FOLLOW-UP PRINCIPES

1. ESCALEER GELEIDELIJK (micro-commitments): elke follow-up is 1 stap hoger dan de vorige. Nooit van 0 naar "laten we een call plannen".
2. GIVE FIRST: elke follow-up geeft iets nieuws — een extra inzicht, een screenshot, een concurrent-voorbeeld. Nooit "ik wilde even opvolgen".
3. KANAAL WISSELEN: als email niet werkt, probeer telefoon of LinkedIn. Niet hetzelfde kanaal 3x herhalen.
4. TIMING: 2-3 dagen na eerste contact, dan 5-7 dagen, dan 10-14 dagen. Niet te snel, niet te laat.
5. P2P FRAME: casual, menselijk, geen corporate follow-up taal. "Ik" niet "wij".

## ANTI-PATRONEN
- NOOIT "Ik wilde even opvolgen" of "Ter opvolging van mijn vorig bericht"
- NOOIT hetzelfde bericht opnieuw sturen
- NOOIT meer dan 4 follow-ups totaal (daarna → ignored of parkeer)

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
