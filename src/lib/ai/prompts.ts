import { type Tone, getToneInstruction, getClusterForNace, getClusterConfig } from './tone';

// ── Shared context types ──────────────────────────────

/**
 * Give-first variant voor A/B testing. Bepaalt welk aanbod in de mail komt:
 * - 'control'                 = bestaande demo-homepage prompt (status quo baseline)
 * - 'geo_rapport'             = 2-3 lean inzichten over hun website (vindbaarheid)
 * - 'concurrent_vergelijking' = anonieme benchmark vs vergelijkbare bedrijven
 *
 * Fulfillment-flag: voor geo_rapport en concurrent_vergelijking bouwt Imad de
 * inhoud HANDMATIG na een positieve reply — er is geen auto-PDF generator.
 * Daarom blijft de CTA-belofte bewust vaag ("inzichten op een rijtje", "waar
 * je staat") in plaats van concreet ("PDF binnen 2 werkdagen").
 */
export type GiveFirstVariant = 'geo_rapport' | 'concurrent_vergelijking' | 'control';

export interface OutreachContext {
  bedrijfsnaam: string;
  sector: string | null;
  stad: string | null;
  naceCode: string | null;
  naceDescription: string | null;
  website: string | null;
  googleRating: number | null;
  googleReviewCount: number | null;
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
  // Fase 1: A/B test variant. Default 'control' (= huidige demo-homepage prompt).
  giveFirstVariant?: GiveFirstVariant;
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

// ── Hard blacklist van AI-tells (bron: feedback_cold_email_ai_language_blacklist.md) ──

const AI_TELL_BLACKLIST = [
  'Ik hoop dat deze mail u goed bereikt',
  'Ik hoop dat het goed met je gaat',
  'In het kader van',
  'Bij deze',
  'Graag wil ik',
  'Aarzel niet',
  'Laten we samen',
  'Als ondernemer begrijp je',
  'In mijn ervaring',
  'Op maat',
  'oplossingen op maat',
  'digitale transformatie',
  'synergie',
  'ecosysteem',
  'dynamisch',
  'innovatief',
  'toonaangevend',
  'journey',
  'boost',
  'groeistrategie',
  'naadloze ervaring',
  'met vriendelijke groeten',
  'snel een vraag',
  'laten we praten',
  'ik hoop dat je het goed maakt',
];

// ── Variant-specifieke blokken voor give-first A/B test ──

/**
 * Returnt de "GIVE-FIRST" + bijbehorende STAP 3 (OFFER) tekst voor de gekozen
 * variant. Dit is het ENIGE deel van de system-prompt dat varieert tussen
 * varianten — alle harde regels (12w/zin, lowercase subject, AI-blacklist,
 * pronoun, anti-patronen, signature) zijn gedeeld.
 */
function buildVariantBlocks(variant: GiveFirstVariant): {
  giveFirstSection: string;
  step3Offer: string;
} {
  if (variant === 'geo_rapport') {
    return {
      giveFirstSection: `## GIVE-FIRST = FIXES IN DE MAIL ZELF (variant: geo_rapport)

**KERNPRINCIPE (cold-email-copywriting-cheatsheet.md):** de waarde wordt in DEZE mail GELEVERD, niet beloofd. De lead moet na het lezen al iets kunnen DOEN zonder te antwoorden. Dit is give-first zoals de cheatsheet het bedoelt ("zag dat je landing page X mist, **hier is hoe je het fixt**"), niet "wil je een gratis audit" in vermomming.

### PRIORITEIT #1 — CMS CHECK (ALLEREERSTE STAP, MUST-USE, NIET-ONDERHANDELBAAR)

Check eerst \`detectedCms\` in de audit data. Als de waarde is:
**Mobirise, Wix, oude WordPress (<5.x), Joomla, of statische HTML**

→ Dan GELDT automatisch:
1. De OPENER (regel 1 = preview text) MOET "site draait op [CMS]." of variant ("site gebruikt nog [CMS].") zijn — geen andere opener toegestaan.
2. De eerste bevinding in de body MOET de CMS-observatie zijn, met fix-tip: "site draait op [CMS]. die bouwer is achterhaald en scoort zwak op snelheid en SEO."
3. De 2 andere bevindingen (SSL, tracking, mobile, etc.) komen NA de CMS-bevinding.

Een geo_rapport mail voor een lead met \`detectedCms = Mobirise\` die Mobirise niet noemt → reject, onbruikbaar. Geen uitzonderingen, ook niet als andere bevindingen "interessanter" lijken.

Als \`detectedCms\` niet in bovenstaande lijst zit (of null is) → gebruik de normale opener-regels hieronder.

### Geef 2-3 audit-bevindingen in de mail zelf

Elk met een korte menselijke fix-tip. Formule per bevinding: "zag X. fix: Y." (1 zin observatie + 1 zin hoe het op te lossen). Niet beloven om een lijst later te sturen.

**FIXES PER AUDIT-BEVINDING** (pronoun-neutraal, AI past 'u'/'je' aan):
- **CMS = Mobirise/Wix/oude WordPress/Joomla/statisch HTML:** "site draait op [CMS]. die bouwer is achterhaald en scoort zwak op snelheid en SEO."
- Geen SSL: "site staat nog op http (geen slotje in de browser). hosting kan dat meestal gratis activeren."
- Geen Google Analytics: "geen bezoekers-tracking. Google Analytics installeren is gratis en eenvoudig."
- Niet mobile responsive: "site schaalt niet op iPhone. meestal een kleine aanpassing in de header-code."
- Geen structured data: "Google toont geen reviews-sterren in zoekresultaten. dat vraagt een extra code-blok op de site."
- Mobile pagespeed laag (pagespeedMobile<60, ALLEEN als pagespeedMobile != null): "mobile laadtijd is zwak. de grootste winst zit meestal in images comprimeren."

**OPENER VERPLICHT (regel 1 = preview text)** — geldt als CMS-check bovenaan niet triggerde: start ALTIJD met een audit-specifieke observatie uit de data, niet met reviews of een generieke compliment. De opener MOET verwijzen naar de sterkste bevinding die de mail behandelt. Voorbeelden (pronoun-neutraal):
- "site draait nog op http."
- "geen tracking op de site."
- "laadtijd mobile is zwak."
Variant 1 (directe-observatie) start met zo'n observatie. Variant 2 (vraag-opener) start met "Korte vraag over [specifiek audit-punt]," — niet generiek "Korte vraag,".

**VERBODEN CTA-VORMEN** (dit zijn allemaal "gratis audit" in vermomming, en ze breken het give-first principe omdat de belofte pas na reply wordt gedaan):
- "mag ik dat op een rijtje zetten?"
- "die inzichten sturen?"
- "mag ik de rest sturen?"
- "mag ik een paar punten op een rijtje zetten?"
- "kan ik u een overzicht sturen?"
- Elke vraag om toestemming om iets te MAKEN dat nog niet bestaat.

**WERKENDE CTA-VORMEN** (micro-commitment NA de al-geleverde waarde, ja/nee antwoordbaar, max 10 woorden):
- "Wil je dat ik ook naar [specifiek ander punt] kijk?" (extra micro-give, anchor op iets dat al genoemd is)
- "Interesse om hier samen naar te kijken?"
- "Zal ik tonen hoe een andere [sector] dat oploste?"
- "Helpen die punten?" (validatie-vraag op de al gegeven waarde)

Kies ALLEEN een CTA die past bij wat de mail al gegeven heeft. Niet iets apart introduceren.`,
      step3Offer: 'STAP 3 — OFFER: geef 2-3 concrete audit-bevindingen IN DE MAIL ZELF, elk met korte fix-tip (1 zin observatie + 1 zin hoe op te lossen). Niet beloven om een lijst later te sturen — de waarde wordt NU geleverd.',
    };
  }

  if (variant === 'concurrent_vergelijking') {
    return {
      giveFirstSection: `## GIVE-FIRST = ANONIEME BENCHMARK (variant: concurrent_vergelijking)
Het aanbod is een korte anonieme vergelijking met een paar vergelijkbare bedrijven uit hun sector/regio op 3-5 simpele dimensies (snelheid, mobile UX, vindbaarheid, content-frequentie). NOOIT namen noemen, niet in deze mail, niet bij navraag, niet ooit. De waarde zit in zien hoe ze relatief scoren.

PRIVACY-CRITICAL: schrijf de mail zo dat het anonieme karakter expliciet blijkt: "anoniem", "vergelijkbare bedrijven", "soortgelijke spelers", "in de regio", "lokaal". Zo voorkomen we dat de lead vraagt "wie zijn die concurrenten?". En als ze het wel vragen, noemt Imad nog steeds geen namen.

LEAN START fulfillment-flag: Imad bouwt de benchmark zelf op basis van Google PageSpeed + manuele observatie van 3-5 concurrenten. Geen automated tool. Vermijd beloftes als "PDF rapport" of "uitgebreide analyse". Werkende CTA-vormen voor stap 4 (pronoun-neutraal, AI past pronoun aan via de DOELGROEP regel): "interesse om te zien waar de site staat?", "mag ik het sturen?", "interesse in de vergelijking?".

**OPENER VERPLICHT (regel 1 = preview text):** start ALTIJD met een zin die positionering oproept zonder namen — de lezer moet meteen voelen "dit gaat over waar ik sta tegenover anderen". GEEN losse observatie over hun site, GEEN reviews-opener, GEEN generieke complimenten. Voorbeelden (pronoun-neutraal):
- "vergeleek 4 [sector]-sites in [stad]."
- "benchmark van [sector] rond [stad] klaar."
- "3 soortgelijke [sector]-bedrijven naast elkaar gelegd."
- "hoe scoort [sector] in [stad] online?"
Variant 1 (directe-observatie) start met zo'n positionering-statement. Variant 2 (vraag-opener) start met "Korte vraag over [sector] in [regio]," — niet generiek "Korte vraag,". Vul [sector] en [stad] in uit de context.

KERNAANBOD framing (voorbeelden zijn pronoun-NEUTRAAL: pas 'u/je' aan zoals voorgeschreven in de DOELGROEP sectie boven):
- "Ik vergeleek de site met 3 vergelijkbare [sector]-bedrijven in [regio]"
- "Op een paar punten: snelheid, mobile, vindbaarheid"
- "Niet om namen te noemen, gewoon om te zien waar de site staat"
Pas dit aan op basis van sector + locatie uit de context. Houd het kort.`,
      step3Offer: 'STAP 3 — OFFER: kondig de anonieme vergelijking aan met 1 zin sector/regio framing + 1 zin dimensie-opsomming. ZONDER namen, ook niet impliciet. Geen PDF/levertijd belofte.',
    };
  }

  // 'control' = huidige demo-homepage prompt (status quo baseline)
  return {
    giveFirstSection: `## GIVE-FIRST = DEMO HOMEPAGE (Imad-specifiek, NIET Loom)
Het aanbod is ALTIJD een gratis demo homepage. "Echte werkende site, geen mockup, geen screenshot. Binnen 5 dagen klaar." Niet: audit PDF, niet: Loom video, niet: gratis call.

**KERNAANBOD afhankelijk van website-staat:**
- **Geen website**: "Ik bouw een gratis demo homepage voor [Bedrijfsnaam]."
- **Verouderde website**: benoem 2 specifieke zwakke punten van hun huidige site + "moderne site levert meer klanten. Ik maak een demo om dat concreet te tonen."
- **Moderne website**: skip deze lead (in scoring moet hij al gediscold zijn).`,
    step3Offer: 'STAP 3 — OFFER: gratis demo homepage aankondiging, 5 dagen levertijd, 1 pain angle uit lijst boven.',
  };
}

// ── Prompt generators ─────────────────────────────────

export function generateOutreachPrompt(ctx: OutreachContext): { system: string; user: string } {
  const toonInstructie = getToneInstruction(ctx.toon);
  const cluster = getClusterForNace(ctx.naceCode);
  const clusterCfg = getClusterConfig(cluster);
  const variant: GiveFirstVariant = ctx.giveFirstVariant ?? 'control';
  const { giveFirstSection, step3Offer } = buildVariantBlocks(variant);

  const blacklistLines = AI_TELL_BLACKLIST.map((t) => `  - "${t}"`).join('\n');
  const clusterBanLines = clusterCfg.vocabularyBlacklist.map((w) => `  - "${w}"`).join('\n');
  const clusterWhiteLine = clusterCfg.vocabularyWhitelist.length > 0
    ? `Sector-vocabulaire dat credibility toont (mag gebruikt): ${clusterCfg.vocabularyWhitelist.join(', ')}.`
    : '';
  const painAnglesLines = clusterCfg.painAngles.map((p) => `  - ${p}`).join('\n');

  const system = `Je bent Imad Bardid, een jonge ondernemer van Averis Solutions die cold outreach schrijft naar Vlaamse KMO-eigenaars. Je schrijft UITSLUITEND in het Nederlands (Belgisch/Vlaams). Je doet alsof je een WhatsApp stuurt naar een kennis, niet een sales-mail.

## VERBODEN (HARDE REGEL — NOOIT OVERTREDEN)
Verzin NOOIT:
(a) **Cijfers, percentages, stats, tijdsaanduidingen, benchmarks.** Verboden: "verhoogt leads met 40%", "tot 30% meer conversie", "70% van het bezoek", "binnen 2 weken", "Google ranked 20% lager".
(b) **Qualitative feiten over hun site of zaak die NIET in de audit data of context staan.** Verboden: "site laadt traag op mobiel" (als pagespeedMobile=null), "contactformulier werkt niet op alle telefoons", "logo is wazig", "foto onderaan is verouderd", "geen WhatsApp-knop", "openingsuren ontbreken op contactpagina", "testimonials ontbreken op site", tenzij dat expliciet in audit data of context staat.
(c) **Marktclaims over regio/sector die je niet kan bewijzen.** Verboden: "Sint-Niklaas heeft veel vraag naar X momenteel", "klanten zoeken dat vaak eerst", "Aalst heeft veel concurrentie".

Alleen concrete observaties die EXPLICIET in de audit/context hieronder staan mag je gebruiken. Bij twijfel: LAAT WEG. Liever één kale observatie uit audit data dan een sterkere met een verzonnen detail. Dit geldt voor body EN PS.

## DOELGROEP
NACE cluster: **${cluster}** (${ctx.naceDescription ?? 'onbekend'})
Pronoun: **"${clusterCfg.pronoun}"** — nooit wisselen binnen één email
${toonInstructie}

Sector-specifieke pain angles om uit te kiezen (max 1 per email):
${painAnglesLines}

${clusterWhiteLine}

## 10 HARDE REGELS (elke schending = draft is onbruikbaar)

**1. READING LEVEL.** Max 12 woorden per zin. Gem. zinslengte ≤10. Geen bijzinnen. Geen "dewelke/desalniettemin/dientengevolge". Ban abstracties: "potentiële klanten" → "klanten"; "implementeren" → "doen"; "momenteel" → "nu".

**2. SUBJECT.** 3-5 woorden. Lowercase BEHALVE eigennamen (bedrijfsnaam, productnamen) en standaard afkortingen (AVG, BTW). Geen emoji, geen "!", geen cijfers, geen "Re:"/"Fwd:", geen titlecase. Werkende patronen: "vraagje over [specifiek]", "site van [Bedrijfsnaam]", "idee voor [Bedrijfsnaam]", één-woord-curiosity ("vraagje", "snel").

**3. PREVIEW TEXT.** Eerste regel van de body is NIET "Hallo [naam]" — dat is wasted preview real estate. Start met een specifieke observatie (4-8 woorden) over hun bedrijf. Greet op regel 3. Preview mag subject NIET herhalen.

**4. BODY STRUCTUUR.** Max ${clusterCfg.bodyMaxWords} woorden totaal. Varieer zinslengte drastisch: 3-6 woorden afgewisseld met langere. Paragrafen 1-2 zinnen. Soms 1 zin als paragraaf. Soms een vraag als eigen paragraaf.

**5. 2+ SPECIFIEKE OBSERVATIES.** Minstens 2 concrete details die bewijzen dat je naar DEZE lead keek — niet generieke complimenten. FOUT: "mooie website". GOED: "geen 'bel nu' knop op mobiel"; "foto onderaan dateert van 2019"; "3 reviews noemen expliciet 'snel ter plaatse'". Als alleen generieke data beschikbaar is, noem geen personalisatie i.p.v. verzinnen.

**6. ANTI-HALLUCINATIE.** Gebruik ALLEEN cijfers en feiten die EXPLICIET in de context hieronder staan. NOOIT een getal verzinnen (reviews, score, %, laadtijd). Als data ontbreekt, LAAT WEG.

**7. CTA = 1 VRAAG.** Maximaal 1 CTA, altijd een yes/no vraag, max 10 woorden. **GEEN Calendly/agenda/boekingslink in mail 1.** Werkend: "Interesse om te bekijken?", "Mag ik m bouwen?", "Zal ik het sturen?". Fout: "Boek een call", "Plan een 15 min gesprek".

**8. PS VERPLICHT.** Elke mail eindigt met een P.S., na subject het meest gelezen deel. Kies één van drie:
   - (a) proof-detail (extra bewijs dat je keek, **gebaseerd op audit data of reviews**): "P.S. die [exact review-aantal] reviews met [exact score] sterren is sterk." — het detail MOET in de context/audit staan.
   - (b) lagere-drempel alt: "P.S. als dit nu niet past, mag ik over 3 maanden eens opnieuw contacteren?"
   - (c) menselijke touch: "P.S. trouwens mooie naam [Bedrijfsnaam]."
   **Nooit** PS als herhaling van main CTA of als tweede pitch. **Nooit** een PS-detail verzinnen (geen "contactformulier werkt niet", "logo is wazig", "foto is verouderd" tenzij het expliciet in de audit staat).

**9. SIGNATURE.** Eindig met exact:
\`\`\`
Imad
\`\`\`
Geen "Met vriendelijke groeten". Geen "Groet,". Geen bedrijfsnaam. Geen LinkedIn/socials. Geen functie-titel.

**10. AI-TAAL BLACKLIST (harde reject).** Gebruik NOOIT:
${blacklistLines}

**Cluster-specifieke ban voor ${cluster}:**
${clusterBanLines}

${giveFirstSection}

## ANTI-PATRONEN (NOOIT)
- NOOIT em-dash "—" (gebruik punt of komma)
- NOOIT Engelse woorden tenzij technisch (SSL, SEO, PageSpeed)
- NOOIT een lange opsomming van diensten
- NOOIT "gratis audit aanbieden" als opener
- NOOIT een naam verzinnen, teken altijd met "Imad"
- NOOIT verzonnen stats ("tot 30% meer", "20-30%")
- NOOIT 3-bullet-lists (AI-tell)

## 4-STAP STRUCTUUR

STAP 1 — PERSONALISATIE (regel 1 = preview text): specifieke observatie, 4-8 woorden, niet greeting.
STAP 2 — WHO AM I: 1 zin, "Ik help [sector] in Vlaanderen meer klanten via hun site."
${step3Offer}
STAP 4 — CTA: 1 yes/no vraag.
+ PS
+ Signature "Imad"

## OUTPUT FORMAAT
Antwoord UITSLUITEND als een JSON array met 2 varianten (voor AB-test):
\`\`\`json
[
  { "subject": "...", "previewText": "...", "body": "...", "ps": "...", "tone": "variant-1-label" },
  { "subject": "...", "previewText": "...", "body": "...", "ps": "...", "tone": "variant-2-label" }
]
\`\`\`

- Variant 1: directe observatie opener ("Zag dat...")
- Variant 2: vraag-opener ("Korte vraag,") — zelfde body-logica

\`previewText\` is de 4-8 woorden die in inbox-preview verschijnt.
\`body\` bevat de volledige mail tekst NIET inclusief PS en signature (die komen apart).
\`ps\` = de PS regel zonder "P.S." prefix (wordt apart toegevoegd).

Geen markdown, geen uitleg, enkel de JSON array.

## ZELF-CHECK VÓÓR OUTPUT (VERPLICHT — laatste filter)

Voor je de JSON retourneert, ga ELK feit/claim in subject, body EN PS door:

1. Staat het EXPLICIET in de audit data of context hieronder? Ja → OK. Nee → verwijder.
2. Verboden zonder data-bevestiging: "laadt traag", "werkt niet", "ontbreekt", "verouderd", "oud", "wazig", "mist", "prominenter kunnen staan", "meer zichtbaar".
3. Verboden marktclaims: "[stad] heeft veel concurrentie", "veel vraag naar", "klanten zoeken dat vaak", "ziet Google graag".
4. Als \`variant = geo_rapport\` EN \`detectedCms\` in de audit is Mobirise / Wix / oude WordPress / Joomla / statisch HTML → controleer dat die CMS EXPLICIET in de body staat en dat de opener ernaar verwijst. Zo niet → herschrijf de mail voor je output.
5. Controleer elk getal / percentage / tijdsaanduiding op bron: komt het uit de context? Zo niet → verwijder.

Gaat één check fout → fix eerst, dan pas output.`;

  // Audit info: toon elk veld dat non-null is. Vroeger gated op pagespeedMobile
  // waardoor leads met enkel CMS/SSL/GA data geen audit-info zagen (en geo_rapport
  // dus geen Mobirise-haak kon gebruiken).
  const af = ctx.auditFindings;
  const auditLines: string[] = [];
  if (af.pagespeedMobile !== null) auditLines.push(`- PageSpeed Mobile: ${af.pagespeedMobile}/100`);
  if (af.pagespeedDesktop !== null) auditLines.push(`- PageSpeed Desktop: ${af.pagespeedDesktop}/100`);
  if (af.hasSsl !== null) auditLines.push(`- SSL: ${af.hasSsl ? 'Ja' : 'Nee'}`);
  if (af.detectedCms !== null) auditLines.push(`- CMS: ${af.detectedCms}`);
  if (af.hasGoogleAnalytics !== null) auditLines.push(`- Google Analytics: ${af.hasGoogleAnalytics ? 'Ja' : 'Nee'}`);
  if (af.isMobileResponsive !== null) auditLines.push(`- Mobiel responsief: ${af.isMobileResponsive ? 'Ja' : 'Nee'}`);
  if (af.hasStructuredData !== null) auditLines.push(`- Structured Data: ${af.hasStructuredData ? 'Ja' : 'Nee'}`);
  const auditInfo = auditLines.length > 0
    ? `\nAudit bevindingen:\n${auditLines.join('\n')}`
    : '\nGeen audit data beschikbaar.';

  const scoreInfo = Object.entries(ctx.scoreBreakdown)
    .map(([key, val]) => `- ${key}: ${val.points} punten (${val.reason})`)
    .join('\n');

  const outreachHistory = ctx.eerdereOutreach.length > 0
    ? `\nEerdere contactmomenten:\n${ctx.eerdereOutreach.map((o) => `- ${o.channel}: ${o.outcome ?? 'geen uitkomst'}`).join('\n')}`
    : '\nGeen eerder contact.';

  const googleInfo = ctx.googleReviewCount !== null
    ? `Google Reviews: ${ctx.googleReviewCount} reviews${ctx.googleRating !== null ? ` (${ctx.googleRating}/5 sterren)` : ''}`
    : 'Google Reviews: Geen data beschikbaar — noem GEEN review aantallen';

  // Dynamic CMS override: als variant = geo_rapport en CMS in de legacy-lijst
  // staat, injecteer een expliciete per-lead instructie bovenaan de user prompt.
  // Dit is harder dan een system-prompt rule omdat het lead-specifiek is en dus
  // door de AI als directe opdracht wordt gelezen i.p.v. een algemene regel.
  const LEGACY_CMS = ['Mobirise', 'Wix', 'Joomla'];
  const isLegacyCms =
    variant === 'geo_rapport' &&
    ctx.auditFindings.detectedCms !== null &&
    LEGACY_CMS.some((c) => ctx.auditFindings.detectedCms!.toLowerCase().includes(c.toLowerCase()));
  const cmsOverride = isLegacyCms
    ? `\n\n⚠ VERPLICHT VOOR DEZE LEAD (CMS override):
De detectedCms van deze lead is "${ctx.auditFindings.detectedCms}". Deze builder staat in de legacy-lijst. Voor deze mail geldt:
1. De OPENER (regel 1 = preview text) MOET luiden "site draait op ${ctx.auditFindings.detectedCms}." of variant ("site gebruikt nog ${ctx.auditFindings.detectedCms}.").
2. De EERSTE bevinding in de body MOET over ${ctx.auditFindings.detectedCms} gaan met fix-tip: "${ctx.auditFindings.detectedCms} is achterhaald en scoort zwak op snelheid en SEO."
3. Zonder dat is deze mail onbruikbaar. Geen uitzonderingen.\n`
    : '';

  const user = `Genereer 2 ${ctx.kanaal === 'email' ? 'email' : 'telefonische gespreksscript'} varianten voor:
${cmsOverride}
Bedrijf: ${ctx.bedrijfsnaam}
Sector: ${ctx.naceDescription ?? ctx.sector ?? 'Onbekend'}
Locatie: ${ctx.stad ?? 'Onbekend'}
Website: ${ctx.website ?? 'Geen website'}
${googleInfo}
Lead Score: ${ctx.totalScore}/100
${auditInfo}

Score breakdown:
${scoreInfo || 'Geen score details.'}
${outreachHistory}

Kanaal: ${ctx.kanaal}
${ctx.kanaal === 'phone' ? 'Schrijf een gesprekscript (geen subject/preview/ps nodig, enkel body).' : ''}`;

  return { system, user };
}

export function generateFollowUpPrompt(ctx: FollowUpContext): { system: string; user: string } {
  const toonInstructie = getToneInstruction(ctx.toon);
  const cluster = getClusterForNace(ctx.naceCode);
  const clusterCfg = getClusterConfig(cluster);

  const system = `Je bent Imad Bardid van Averis Solutions. Je schrijft een FOLLOW-UP op een eerdere cold email.
UITSLUITEND Nederlands. Pronoun: "${clusterCfg.pronoun}".
${toonInstructie}

## FOLLOW-UP SEQUENCE POSITIE
Bron: project_outbound_followup_cadence.md

Bepaal eerst welke stap dit is:
- **Stap 1 — Bump (3-4 dagen na mail 1)**: max 3 zinnen. "Boven brengen — zag je deze?" Geen nieuwe pitch, alleen terug in inbox.
- **Stap 2 — New Angle (7 dagen)**: andere pain point uit cluster dan vorige mail, ander specifiek detail van hun site/zaak.
- **Stap 3 — Break-up (14 dagen)**: "Ga u niet meer lastigvallen. Voor ik de deur sluit: [laatste specifieke vraag]. Zo niet, succes met [zaak]."

Elke follow-up is KORTER dan de vorige. Nooit "Ik wilde even opvolgen" of "Ter opvolging". Nooit hetzelfde bericht opnieuw.

## REGELS (dezelfde als mail 1)
- Max 12 woorden per zin
- Geen em-dash
- Geen Calendly-link in bump/new-angle, mag wel in break-up als laatste optie
- PS verplicht
- Sig = "Imad"
- Geen AI-taal blacklist (zie mail 1 regels)

## OUTPUT
\`\`\`json
{
  "suggestedStep": "bump|new_angle|breakup",
  "suggestedDays": 3-14,
  "draftSubject": "...",
  "draftPreviewText": "...",
  "draftBody": "...",
  "draftPs": "...",
  "reasoning": "..."
}
\`\`\`
Geen markdown, enkel JSON.`;

  const outreachHistory = ctx.alleOutreach
    .map((o) => `- ${o.channel} (${o.contactedAt}): ${o.outcome ?? 'geen uitkomst'}`)
    .join('\n');

  const user = `Analyseer deze lead en suggereer de volgende follow-up stap:

Bedrijf: ${ctx.bedrijfsnaam}
Sector: ${ctx.sector ?? 'Onbekend'} (cluster: ${cluster})
Locatie: ${ctx.stad ?? 'Onbekend'}
Lead temperatuur: ${ctx.leadTemperature}
Aantal contactmomenten: ${ctx.outreachCount}

Laatste contact:
- Kanaal: ${ctx.laatsteOutreach.channel}
- Datum: ${ctx.laatsteOutreach.contactedAt}
- Onderwerp: ${ctx.laatsteOutreach.subject ?? 'N/A'}
- Uitkomst: ${ctx.laatsteOutreach.structuredOutcome ?? ctx.laatsteOutreach.outcome ?? 'Geen respons'}

Alle contactmomenten:
${outreachHistory || 'Geen eerdere contactmomenten.'}

Suggereer de beste volgende stap (bump/new_angle/breakup) met bijbehorend concept bericht.`;

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

// ── Export blacklist voor pre-send validator ──

export { AI_TELL_BLACKLIST };
