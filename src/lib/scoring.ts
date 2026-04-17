import { getSectorTier, getSectorMedianReviews, isZichtbaarheidsSector } from './nace-config';
import { isChainDisqualifier, type ChainClassification } from './classify/franchise';

// ── Interfaces ────────────────────────────────────────

export interface ScoreInput {
  business: {
    website: string | null;
    foundedDate: string | null;
    naceCode: string | null;
    legalForm: string | null;
    email: string | null;
    phone: string | null;
    googleRating: number | null;
    googleReviewCount: number | null;
    googleBusinessStatus: string | null;
    googlePhotosCount: number | null;
    hasGoogleBusinessProfile: boolean | null;
    optOut: boolean;
    googlePlacesEnrichedAt: Date | null;
    // Fase 2: dynamische intent-signalen
    recentReviewCount: number | null;
    reviewVelocity: number | null;
    googlePhotosCountPrev: number | null;
    googleBusinessUpdatedAt: Date | null;
    hasGoogleAds: boolean | null;
    hasSocialMediaLinks: boolean | null;
    // Fase 1: franchise/keten classificatie
    chainClassification?: ChainClassification | null;
    chainConfidence?: number | null;
  };
  audit: {
    websiteHttpStatus: number | null;
    pagespeedMobileScore: number | null;
    pagespeedDesktopScore: number | null;
    hasSsl: boolean | null;
    isMobileResponsive: boolean | null;
    hasViewportMeta: boolean | null;
    detectedCms: string | null;
    detectedTechnologies: string[] | null;
    hasGoogleAnalytics: boolean | null;
    hasGoogleTagManager: boolean | null;
    hasFacebookPixel: boolean | null;
    hasCookieBanner: boolean | null;
    hasMetaDescription: boolean | null;
    hasOpenGraph: boolean | null;
    hasStructuredData: boolean | null;
    auditedAt: Date | null;
    // Fase 2
    hasGoogleAdsTag: boolean | null;
    hasSocialMediaLinks: boolean | null;
  } | null;
}

export type MaturityCluster = 'A' | 'B' | 'C' | 'D';

export interface ScoreResult {
  totalScore: number;
  disqualified: boolean;
  disqualifyReason: string | null;
  breakdown: Record<string, { points: number; reason: string; dimension: string }>;
  maturityCluster: MaturityCluster;
  maturityMultiplier: number;
}

// ── Dimension caps ────────────────────────────────────

const MAX_OPPORTUNITY = 18;   // pain = sales argument, not selection
const MAX_ACTIVITY = 22;
const MAX_REACHABILITY = 12;
const MAX_BUDGET = 28;        // primary conversion predictor
const MAX_SPANNING = 15;      // physically active + digitally absent
const MAX_MOMENTUM = 5;       // placeholder for Fase 2

// ── Decay constants ───────────────────────────────────

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────

function getYearsSinceFounded(foundedDate: string | null): number | null {
  if (!foundedDate) return null;
  const founded = new Date(foundedDate);
  return (Date.now() - founded.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

function isBVNV(legalForm: string | null): boolean {
  return legalForm === '014' || legalForm === '015';
}

// ── Maturity cluster classification ──────────────────

export function classifyMaturityCluster(input: ScoreInput): { cluster: MaturityCluster; multiplier: number } {
  const { business, audit } = input;
  const years = getYearsSinceFounded(business.foundedDate);
  const hasReviews = (business.googleReviewCount ?? 0) > 0;
  const hasWebsite = !!business.website;
  const nace = business.naceCode;

  const hasBadSite = !hasWebsite || (audit?.pagespeedMobileScore !== null && (audit?.pagespeedMobileScore ?? 100) < 50);
  const isZichtbaar = isZichtbaarheidsSector(nace);
  const isBv = isBVNV(business.legalForm);

  // Check IT/freelance sector for D
  const isITFreelance = nace != null && (nace.startsWith('620') || nace.startsWith('631'));

  // D: Lage Prioriteit
  if (isITFreelance) {
    return { cluster: 'D', multiplier: 0.5 };
  }
  // Alleen D-classificeren op basis van GBP als we het expliciet weten (false, niet null)
  if (years !== null && years < 2 && business.hasGoogleBusinessProfile === false && !hasWebsite) {
    return { cluster: 'D', multiplier: 0.5 };
  }
  if (years !== null && years > 10 && business.hasGoogleBusinessProfile === false && !hasWebsite && !hasReviews) {
    // 10+ yr deliberately not digital
    return { cluster: 'D', multiplier: 0.5 };
  }

  // A: Bewezen Lokale Speler — 3+ jaar, zichtbaarheidssector, has reviews, no/bad site
  if (years !== null && years >= 3 && isZichtbaar && hasReviews && hasBadSite) {
    return { cluster: 'A', multiplier: 1.3 };
  }

  // B: Groeiende Eenpitter — BV 2+ jaar, professionele sector, outdated/no site
  const sectorTier = getSectorTier(nace);
  const isProfessionalSector = sectorTier.tier === 'A' || sectorTier.tier === 'B';
  if (isBv && years !== null && years >= 2 && isProfessionalSector && hasBadSite) {
    return { cluster: 'B', multiplier: 1.15 };
  }

  // C: Ambitieuze Starter — <3 jaar, commercial sector, has Google Business
  const isCommercialSector = sectorTier.tier !== null && sectorTier.tier !== 'D';
  if (years !== null && years < 3 && isCommercialSector && business.hasGoogleBusinessProfile) {
    return { cluster: 'C', multiplier: 1.0 };
  }

  // Default: C
  return { cluster: 'C', multiplier: 1.0 };
}

// ── Main scoring function ─────────────────────────────

export function computeScore(input: ScoreInput): ScoreResult {
  const { business, audit } = input;
  const breakdown: Record<string, { points: number; reason: string; dimension: string }> = {};

  // ── Hard disqualifiers ──────────────────────────────

  if (business.optOut) {
    return { totalScore: 0, disqualified: true, disqualifyReason: 'Opt-out', breakdown: {}, maturityCluster: 'D', maturityMultiplier: 0 };
  }

  if (business.googleBusinessStatus === 'CLOSED_PERMANENTLY') {
    return { totalScore: 0, disqualified: true, disqualifyReason: 'Permanent gesloten (Google)', breakdown: {}, maturityCluster: 'D', maturityMultiplier: 0 };
  }

  // Fase 1: keten/franchise/corporate = geen lokale beslisser, geen prospect
  // Alleen disqualificeren als classifier confident is (>=0.7), anders "twijfel" queue
  if (
    business.chainClassification &&
    isChainDisqualifier(business.chainClassification) &&
    (business.chainConfidence ?? 0) >= 0.7
  ) {
    return {
      totalScore: 0,
      disqualified: true,
      disqualifyReason: `${business.chainClassification === 'franchise' ? 'Franchise' : business.chainClassification === 'chain' ? 'Keten' : 'Corporate'} — geen lokale beslisser`,
      breakdown: {},
      maturityCluster: 'D',
      maturityMultiplier: 0,
    };
  }

  const hasGBP = business.hasGoogleBusinessProfile === true;
  const gbpExplicitlyAbsent = business.hasGoogleBusinessProfile === false; // null = not enriched yet
  const hasWebsite = !!business.website;

  // Alleen disqualificeren als we WETEN dat er geen GBP is (na enrichment),
  // niet wanneer de data gewoon ontbreekt (null = nog niet gecheckt)
  if (gbpExplicitlyAbsent && !hasWebsite) {
    return { totalScore: 0, disqualified: true, disqualifyReason: 'Geen online aanwezigheid (geen website, geen Google profiel)', breakdown: {}, maturityCluster: 'D', maturityMultiplier: 0 };
  }

  // IT/tech sector = competitor
  if (business.naceCode && (business.naceCode.startsWith('620') || business.naceCode.startsWith('631'))) {
    return { totalScore: 0, disqualified: true, disqualifyReason: 'IT/tech sector — concurrent', breakdown: {}, maturityCluster: 'D', maturityMultiplier: 0 };
  }

  // Te groot bedrijf (500+ Google reviews = enterprise/keten)
  if ((business.googleReviewCount ?? 0) > 500) {
    return { totalScore: 0, disqualified: true, disqualifyReason: 'Te groot bedrijf (500+ Google reviews)', breakdown: {}, maturityCluster: 'D', maturityMultiplier: 0 };
  }

  // Onbereikbare website (HTTP 4xx/5xx of timeout)
  if (audit?.websiteHttpStatus != null) {
    if (audit.websiteHttpStatus === 0 || audit.websiteHttpStatus >= 400) {
      return { totalScore: 0, disqualified: true, disqualifyReason: `Website onbereikbaar (HTTP ${audit.websiteHttpStatus})`, breakdown: {}, maturityCluster: 'D', maturityMultiplier: 0 };
    }
  }

  // Moderne professionele website — geen prospect
  if (audit) {
    const modernCheckFrameworks = ['Next.js', 'React', 'Vue', 'Nuxt', 'Angular', 'Svelte', 'Gatsby'];
    const checkTechs = audit.detectedTechnologies ?? [];
    const checkCms = audit.detectedCms?.toLowerCase() ?? '';
    const isBuilderSite = checkCms.includes('wix') || checkCms.includes('squarespace') || checkCms.includes('shopify');

    const hasModernFramework = !isBuilderSite && checkTechs.some(t =>
      modernCheckFrameworks.some(fw => t.toLowerCase().includes(fw.toLowerCase()))
    );
    const hasGoodSpeed = audit.pagespeedMobileScore !== null && audit.pagespeedMobileScore > 80;
    const hasSslCert = audit.hasSsl === true;

    if (hasModernFramework && hasGoodSpeed && hasSslCert) {
      return { totalScore: 0, disqualified: true, disqualifyReason: 'Moderne professionele website — geen prospect', breakdown: {}, maturityCluster: 'D', maturityMultiplier: 0 };
    }
  }

  // ── OPPORTUNITY (max 18) — hoe slecht is hun website? ──

  let opportunityRaw = 0;

  if (audit) {
    const mobile = audit.pagespeedMobileScore;
    if (mobile !== null) {
      if (mobile < 30) {
        breakdown.pagespeedMobile = { points: 6, reason: 'Zeer slechte mobiele snelheid', dimension: 'opportunity' };
        opportunityRaw += 6;
      } else if (mobile < 50) {
        breakdown.pagespeedMobile = { points: 4, reason: 'Slechte mobiele snelheid', dimension: 'opportunity' };
        opportunityRaw += 4;
      } else if (mobile < 70) {
        breakdown.pagespeedMobile = { points: 2, reason: 'Matige mobiele snelheid', dimension: 'opportunity' };
        opportunityRaw += 2;
      }
    }

    if (audit.hasSsl === false) {
      breakdown.noSsl = { points: 3, reason: 'Geen SSL certificaat', dimension: 'opportunity' };
      opportunityRaw += 3;
    }

    if (audit.hasViewportMeta === false) {
      breakdown.notResponsive = { points: 3, reason: 'Niet mobiel-responsive', dimension: 'opportunity' };
      opportunityRaw += 3;
    }

    const cms = audit.detectedCms?.toLowerCase() ?? '';
    if (cms.includes('joomla') || cms.includes('drupal 7')) {
      breakdown.outdatedCms = { points: 2, reason: 'Verouderd CMS', dimension: 'opportunity' };
      opportunityRaw += 2;
    } else if (cms.includes('wordpress')) {
      const v = cms.match(/wordpress\s*(\d+)/i);
      if (v && parseInt(v[1], 10) < 6) {
        breakdown.outdatedCms = { points: 2, reason: 'Verouderd WordPress', dimension: 'opportunity' };
        opportunityRaw += 2;
      }
    }

    if (cms.includes('wix') || cms.includes('squarespace')) {
      breakdown.websiteBuilder = { points: 2, reason: 'Website builder — upgrade kans', dimension: 'opportunity' };
      opportunityRaw += 2;
    }

    const hasAnyAnalytics = audit.hasGoogleAnalytics || audit.hasGoogleTagManager || audit.hasFacebookPixel;
    if (!hasAnyAnalytics) {
      breakdown.noAnalytics = { points: 1, reason: 'Geen analytics', dimension: 'opportunity' };
      opportunityRaw += 1;
    }

    if (audit.hasCookieBanner === false) {
      breakdown.noCookieBanner = { points: 1, reason: 'Geen cookie banner — GDPR risico', dimension: 'opportunity' };
      opportunityRaw += 1;
    }

    if (audit.hasMetaDescription === false || audit.hasOpenGraph === false) {
      breakdown.poorSeo = { points: 1, reason: 'Slechte SEO basis', dimension: 'opportunity' };
      opportunityRaw += 1;
    }

    // Negative: modern framework
    const modernFrameworks = ['Next.js', 'React', 'Vue', 'Nuxt', 'Angular', 'Svelte', 'Gatsby'];
    const techs = audit.detectedTechnologies ?? [];
    if (techs.some(t => modernFrameworks.some(fw => t.toLowerCase().includes(fw.toLowerCase())))) {
      breakdown.modernFramework = { points: -5, reason: 'Modern framework — al geïnvesteerd', dimension: 'opportunity' };
      opportunityRaw -= 5;
    }

    // Negative: good PageSpeed
    if (audit.pagespeedMobileScore !== null && audit.pagespeedMobileScore > 80) {
      breakdown.goodSpeed = { points: -4, reason: 'Goede website snelheid', dimension: 'opportunity' };
      opportunityRaw -= 4;
    }

    // Fase 2: "Al bewust digitaal" — sterkste opportunity signaal
    // Draait Google Ads + slechte site = WEET dat digitaal belangrijk is, GEEFT geld uit, maar converteert niet
    const hasBadSite = audit.pagespeedMobileScore !== null && audit.pagespeedMobileScore < 50;
    if (business.hasGoogleAds && hasBadSite) {
      breakdown.adsWithBadSite = { points: 8, reason: 'Draait Google Ads maar slechte website — sterkste signaal', dimension: 'opportunity' };
      opportunityRaw += 8;
    }

    // Facebook Pixel maar geen GA4 = investeert in ads, meet niets
    if (audit.hasFacebookPixel && !audit.hasGoogleAnalytics) {
      breakdown.pixelNoAnalytics = { points: 3, reason: 'Facebook Pixel maar geen Google Analytics', dimension: 'opportunity' };
      opportunityRaw += 3;
    }

    // Google Ads tag op site maar geen GA4
    if (audit.hasGoogleAdsTag && !audit.hasGoogleAnalytics) {
      breakdown.adsTagNoAnalytics = { points: 3, reason: 'Google Ads tag maar geen Analytics — investeert maar meet niet', dimension: 'opportunity' };
      opportunityRaw += 3;
    }

    // Decay: audit older than 90 days
    if (audit.auditedAt) {
      const auditAge = Date.now() - new Date(audit.auditedAt).getTime();
      if (auditAge > NINETY_DAYS_MS) {
        opportunityRaw = Math.round(opportunityRaw * 0.5);
        breakdown.opportunityDecay = { points: 0, reason: 'Audit data ouder dan 90 dagen (0.5x decay)', dimension: 'opportunity' };
      }
    }
  } else if (!hasWebsite && hasGBP) {
    // No website but has Google Business Profile = opportunity
    breakdown.noWebsiteWithGBP = { points: 5, reason: 'Geen website maar actief op Google', dimension: 'opportunity' };
    opportunityRaw += 5;
  }

  const opportunity = Math.max(0, Math.min(MAX_OPPORTUNITY, opportunityRaw));

  // ── ACTIVITY (max 22) — is het bedrijf echt actief? ──

  let activityRaw = 0;

  const reviews = business.googleReviewCount ?? 0;
  if (reviews > 50) {
    breakdown.reviewsHigh = { points: 8, reason: '50+ Google reviews', dimension: 'activity' };
    activityRaw += 8;
  } else if (reviews > 20) {
    breakdown.reviewsMedium = { points: 6, reason: '20+ Google reviews', dimension: 'activity' };
    activityRaw += 6;
  } else if (reviews > 5) {
    breakdown.reviewsLow = { points: 3, reason: '5+ Google reviews', dimension: 'activity' };
    activityRaw += 3;
  } else if (reviews > 0) {
    breakdown.reviewsMinimal = { points: 2, reason: 'Google reviews aanwezig', dimension: 'activity' };
    activityRaw += 2;
  }

  const rating = business.googleRating ?? 0;
  if (rating > 4.0) {
    breakdown.goodRating = { points: 4, reason: 'Google rating > 4.0', dimension: 'activity' };
    activityRaw += 4;
  } else if (rating > 3.5) {
    breakdown.okRating = { points: 2, reason: 'Google rating > 3.5', dimension: 'activity' };
    activityRaw += 2;
  }

  if (business.googleBusinessStatus === 'OPERATIONAL') {
    breakdown.operational = { points: 4, reason: 'Google status: operationeel', dimension: 'activity' };
    activityRaw += 4;
  }

  if ((business.googlePhotosCount ?? 0) > 5) {
    breakdown.hasPhotos = { points: 2, reason: 'Google foto\'s aanwezig', dimension: 'activity' };
    activityRaw += 2;
  }

  const years = getYearsSinceFounded(business.foundedDate);
  if (years !== null) {
    if (years > 10) {
      breakdown.established = { points: 4, reason: 'Gevestigd bedrijf (10+ jaar)', dimension: 'activity' };
      activityRaw += 4;
    } else if (years > 5) {
      breakdown.mature = { points: 2, reason: 'Actief bedrijf (5+ jaar)', dimension: 'activity' };
      activityRaw += 2;
    }
  }

  // Fase 2: Review velocity — recente reviews zijn waardevoller dan oude
  const velocity = business.reviewVelocity;
  if (velocity !== null) {
    if (velocity > 0.3) {
      breakdown.reviewVelocityHigh = { points: 6, reason: `Review velocity ${(velocity * 100).toFixed(0)}% — zeer actief`, dimension: 'activity' };
      activityRaw += 6;
    } else if (velocity > 0.1) {
      breakdown.reviewVelocityMedium = { points: 3, reason: `Review velocity ${(velocity * 100).toFixed(0)}% — actief`, dimension: 'activity' };
      activityRaw += 3;
    }
  }

  // Decay: Google Places data older than 90 days
  if (business.googlePlacesEnrichedAt) {
    const enrichAge = Date.now() - new Date(business.googlePlacesEnrichedAt).getTime();
    if (enrichAge > NINETY_DAYS_MS) {
      activityRaw = Math.round(activityRaw * 0.7);
      breakdown.activityDecay = { points: 0, reason: 'Google Places data ouder dan 90 dagen (0.7x decay)', dimension: 'activity' };
    }
  }

  const activity = Math.max(0, Math.min(MAX_ACTIVITY, activityRaw));

  // ── REACHABILITY (max 12) — kun je ze bereiken? ──

  let reachabilityRaw = 0;

  if (business.email) {
    breakdown.hasEmail = { points: 5, reason: 'Email beschikbaar', dimension: 'reachability' };
    reachabilityRaw += 5;
  }

  if (business.phone) {
    breakdown.hasPhone = { points: 4, reason: 'Telefoon beschikbaar', dimension: 'reachability' };
    reachabilityRaw += 4;
  }

  if (hasWebsite) {
    breakdown.hasWebsite = { points: 3, reason: 'Website aanwezig (contact scrapbaar)', dimension: 'reachability' };
    reachabilityRaw += 3;
  }

  const reachability = Math.max(0, Math.min(MAX_REACHABILITY, reachabilityRaw));

  // ── BUDGET (max 28) — kunnen ze betalen? ──

  let budgetRaw = 0;

  if (isBVNV(business.legalForm)) {
    if (years !== null && years >= 7) {
      // BV/NV founded before ~2019 (7+ years from now)
      breakdown.legalFormBVNV = { points: 5, reason: 'BV/NV rechtsvorm (gevestigd)', dimension: 'budget' };
      budgetRaw += 5;
    } else if (years !== null && years < 2) {
      // BV/NV < 2 jaar: no bonus
      breakdown.legalFormBVNV = { points: 0, reason: 'BV/NV rechtsvorm (te jong)', dimension: 'budget' };
    } else {
      breakdown.legalFormBVNV = { points: 3, reason: 'BV/NV rechtsvorm', dimension: 'budget' };
      budgetRaw += 3;
    }
  } else if (['016', '017', '018'].includes(business.legalForm ?? '')) {
    breakdown.legalFormOther = { points: 2, reason: 'CV/VOF/CommV rechtsvorm', dimension: 'budget' };
    budgetRaw += 2;
  } else if (business.legalForm) {
    // Eenmanszaak or other — not penalized
    breakdown.legalFormEenmanszaak = { points: 2, reason: 'Eenmanszaak', dimension: 'budget' };
    budgetRaw += 2;
  }

  // Sector bonus: vastgoed(68), juridisch(691), architecten(711), medisch(862,869)
  const nace = business.naceCode ?? '';
  if (nace.startsWith('68') || nace.startsWith('691') || nace.startsWith('711') || nace.startsWith('862') || nace.startsWith('869')) {
    breakdown.sectorBonus = { points: 6, reason: 'Hoge-budget sector', dimension: 'budget' };
    budgetRaw += 6;
  }

  // Founded age for budget
  if (years !== null) {
    if (years > 10) {
      breakdown.budgetAge = { points: 5, reason: 'Gevestigd 10+ jaar (budget proxy)', dimension: 'budget' };
      budgetRaw += 5;
    } else if (years > 5) {
      breakdown.budgetAge = { points: 3, reason: 'Actief 5-10 jaar (budget proxy)', dimension: 'budget' };
      budgetRaw += 3;
    }
  }

  // Reviews as revenue proxy with sector-normalized benchmarks
  const sectorMedian = getSectorMedianReviews(business.naceCode);
  if (sectorMedian > 0 && reviews > 0) {
    const ratio = reviews / sectorMedian;
    if (ratio > 2.0) {
      breakdown.budgetReviews = { points: 6, reason: `Reviews ver boven sector mediaan (${reviews}/${sectorMedian})`, dimension: 'budget' };
      budgetRaw += 6;
    } else if (ratio >= 1.0) {
      breakdown.budgetReviews = { points: 4, reason: `Reviews boven sector mediaan (${reviews}/${sectorMedian})`, dimension: 'budget' };
      budgetRaw += 4;
    } else if (ratio >= 0.5) {
      breakdown.budgetReviews = { points: 2, reason: `Reviews rond sector mediaan (${reviews}/${sectorMedian})`, dimension: 'budget' };
      budgetRaw += 2;
    }
  }

  // Rating > 4.0 AND reviews > 10: quality + volume = real business
  if (rating > 4.0 && reviews > 10) {
    breakdown.budgetQuality = { points: 4, reason: 'Hoge rating + volume (echt bedrijf)', dimension: 'budget' };
    budgetRaw += 4;
  }

  const budget = Math.max(0, Math.min(MAX_BUDGET, budgetRaw));

  // ── SPANNINGSSIGNAAL (max 15) — fysiek actief + digitaal afwezig ──

  let spanningRaw = 0;

  // Has reviews (>5) but no website
  if (reviews > 5 && !hasWebsite) {
    breakdown.spanningReviewsNoSite = { points: 8, reason: 'Reviews maar geen website', dimension: 'spanning' };
    spanningRaw += 8;
  }

  // Has Google Business but no website
  if (hasGBP && !hasWebsite) {
    breakdown.spanningGBPNoSite = { points: 4, reason: 'Google Business maar geen website', dimension: 'spanning' };
    spanningRaw += 4;
  }

  // Has reviews but terrible website (PageSpeed <30)
  if (reviews > 0 && audit?.pagespeedMobileScore !== null && (audit?.pagespeedMobileScore ?? 100) < 30) {
    breakdown.spanningReviewsBadSite = { points: 5, reason: 'Reviews maar zeer slechte website', dimension: 'spanning' };
    spanningRaw += 5;
  }

  // Has social media (Facebook Pixel) but no real website tracking (no GA4)
  if (audit?.hasFacebookPixel && !audit?.hasGoogleAnalytics) {
    breakdown.spanningSocialNoTracking = { points: 3, reason: 'Social media maar geen website analytics', dimension: 'spanning' };
    spanningRaw += 3;
  }

  // Fase 2: Social media links maar geen website = actief op socials, geen eigen plek
  if (business.hasSocialMediaLinks && !hasWebsite) {
    breakdown.spanningSocialNoSite = { points: 4, reason: 'Social media links maar geen website', dimension: 'spanning' };
    spanningRaw += 4;
  }

  const spanning = Math.max(0, Math.min(MAX_SPANNING, spanningRaw));

  // ── MOMENTUM (max 5) — growth signals (Fase 2) ──

  let momentumRaw = 0;

  // Google Business profiel recent gewijzigd (delta-detectie via n8n re-enrichment)
  if (business.googleBusinessUpdatedAt) {
    const updateAge = Date.now() - new Date(business.googleBusinessUpdatedAt).getTime();
    if (updateAge < NINETY_DAYS_MS) {
      breakdown.gbpRecentUpdate = { points: 3, reason: 'Google Business profiel recent gewijzigd', dimension: 'momentum' };
      momentumRaw += 3;
    }
  }

  // Nieuwe foto's gedetecteerd (vergelijking met vorige enrichment)
  const currentPhotos = business.googlePhotosCount ?? 0;
  const prevPhotos = business.googlePhotosCountPrev ?? 0;
  if (prevPhotos > 0 && currentPhotos > prevPhotos) {
    breakdown.newPhotos = { points: 2, reason: `${currentPhotos - prevPhotos} nieuwe Google foto's`, dimension: 'momentum' };
    momentumRaw += 2;
  }
  const momentum = Math.max(0, Math.min(MAX_MOMENTUM, momentumRaw));

  // ── Maturity cluster ────────────────────────────────

  const { cluster: maturityCluster, multiplier: maturityMultiplier } = classifyMaturityCluster(input);

  // ── TOTAL ───────────────────────────────────────────

  const rawScore = opportunity + activity + reachability + budget + spanning + momentum;
  const totalScore = Math.min(100, Math.round(rawScore * maturityMultiplier));

  return { totalScore, disqualified: false, disqualifyReason: null, breakdown, maturityCluster, maturityMultiplier };
}

// ── Display helpers ───────────────────────────────────

export function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-600 bg-green-50';
  if (score >= 40) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

export function getScoreLabel(score: number): string {
  if (score >= 70) return 'Hot';
  if (score >= 40) return 'Warm';
  return 'Koud';
}
