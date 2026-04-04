interface ScoreInput {
  business: {
    website: string | null;
    foundedDate: string | null;
    naceCode: string | null;
    googleRating: number | null;
    googleReviewCount: number | null;
    optOut: boolean;
  };
  audit: {
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
  } | null;
}

interface ScoreResult {
  totalScore: number;
  breakdown: Record<string, { points: number; reason: string }>;
}

export function computeScore(input: ScoreInput): ScoreResult {
  const { business, audit } = input;
  const breakdown: Record<string, { points: number; reason: string }> = {};

  // Immediate disqualification
  if (business.optOut) {
    return { totalScore: 0, breakdown: { optOut: { points: 0, reason: 'Opt-out' } } };
  }

  // --- POSITIVE SIGNALS ---

  // No website
  if (!business.website) {
    breakdown.noWebsite = { points: 30, reason: 'Geen website gevonden' };
  }

  if (audit) {
    // PageSpeed mobile
    const mobile = audit.pagespeedMobileScore;
    if (mobile !== null) {
      if (mobile < 30) {
        breakdown.pagespeedMobile = { points: 20, reason: 'Zeer slechte mobiele snelheid' };
      } else if (mobile < 50) {
        breakdown.pagespeedMobile = { points: 12, reason: 'Slechte mobiele snelheid' };
      } else if (mobile < 70) {
        breakdown.pagespeedMobile = { points: 5, reason: 'Matige mobiele snelheid' };
      }
    }

    // No SSL
    if (audit.hasSsl === false) {
      breakdown.noSsl = { points: 10, reason: 'Geen SSL certificaat' };
    }

    // Not mobile responsive
    if (audit.hasViewportMeta === false) {
      breakdown.notResponsive = { points: 10, reason: 'Niet mobiel-responsive' };
    }

    // Outdated CMS
    const cms = audit.detectedCms?.toLowerCase() ?? '';
    if (cms.includes('joomla') || cms.includes('drupal 7')) {
      breakdown.outdatedCms = { points: 8, reason: 'Verouderd CMS' };
    } else if (cms.includes('wordpress')) {
      const versionMatch = cms.match(/wordpress\s*(\d+)/i);
      if (versionMatch && parseInt(versionMatch[1], 10) < 6) {
        breakdown.outdatedCms = { points: 8, reason: 'Verouderd CMS' };
      }
    }

    // Wix or Squarespace
    if (cms.includes('wix') || cms.includes('squarespace')) {
      breakdown.websiteBuilder = { points: 5, reason: 'Website builder — upgrade mogelijkheid' };
    }

    // No analytics
    const hasAnyAnalytics =
      audit.hasGoogleAnalytics || audit.hasGoogleTagManager || audit.hasFacebookPixel;
    if (!hasAnyAnalytics) {
      breakdown.noAnalytics = { points: 5, reason: 'Geen analytics geïnstalleerd' };
    }

    // No cookie banner
    if (audit.hasCookieBanner === false) {
      breakdown.noCookieBanner = { points: 5, reason: 'Geen cookie banner — GDPR risico' };
    }

    // No meta description or OG tags
    if (audit.hasMetaDescription === false || audit.hasOpenGraph === false) {
      breakdown.poorSeo = { points: 3, reason: 'Slechte SEO basis' };
    }
  }

  // Founded > 5 years ago
  if (business.foundedDate) {
    const founded = new Date(business.foundedDate);
    const now = new Date();
    const yearsInBusiness = (now.getTime() - founded.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

    if (yearsInBusiness > 10) {
      breakdown.established = { points: 8, reason: 'Gevestigd bedrijf (10+ jaar)' };
    } else if (yearsInBusiness > 5) {
      breakdown.established = { points: 5, reason: 'Gevestigd bedrijf (5+ jaar)' };
    }
  }

  // Google reviews
  if (business.googleReviewCount !== null && business.googleReviewCount > 20) {
    breakdown.activeReviews = { points: 5, reason: 'Actief bedrijf met klanten' };
  }

  // Google rating
  if (business.googleRating !== null && business.googleRating > 4.0) {
    breakdown.goodRating = { points: 3, reason: 'Goede reputatie' };
  }

  // --- NEGATIVE SIGNALS ---

  if (audit) {
    // Modern framework detected
    const modernFrameworks = ['Next.js', 'React', 'Vue', 'Nuxt', 'Angular', 'Svelte', 'Gatsby'];
    const techs = audit.detectedTechnologies ?? [];
    const hasModernFramework = techs.some((tech) =>
      modernFrameworks.some((fw) => tech.toLowerCase().includes(fw.toLowerCase())),
    );
    if (hasModernFramework) {
      breakdown.modernFramework = { points: -15, reason: 'Modern framework — al geïnvesteerd' };
    }

    // Good PageSpeed
    if (audit.pagespeedMobileScore !== null && audit.pagespeedMobileScore > 80) {
      breakdown.goodSpeed = { points: -10, reason: 'Goede website snelheid' };
    }

    // Digitally aware (SSL + responsive + analytics)
    const hasAnyAnalytics =
      audit.hasGoogleAnalytics || audit.hasGoogleTagManager || audit.hasFacebookPixel;
    if (audit.hasSsl && audit.hasViewportMeta && hasAnyAnalytics) {
      breakdown.digitallyAware = { points: -8, reason: 'Digitaal bewust bedrijf' };
    }
  }

  // IT/tech sector
  if (
    business.naceCode &&
    (business.naceCode.startsWith('620') || business.naceCode.startsWith('631'))
  ) {
    breakdown.techSector = { points: -20, reason: 'IT/tech sector — concurrent' };
  }

  // Calculate total
  const totalScore = Math.max(
    0,
    Math.min(
      100,
      Object.values(breakdown).reduce((sum, item) => sum + item.points, 0),
    ),
  );

  return { totalScore, breakdown };
}

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
