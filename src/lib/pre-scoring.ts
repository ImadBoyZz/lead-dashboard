import { getSectorTier, getSectorMedianReviews, isNaceBlacklisted } from './nace-config';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface PreScoreInput {
  naceCode: string | null;
  legalForm: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  // Nullable — not available during KBO staging:
  foundedDate: string | null;          // YYYY-MM-DD
  googleReviewCount: number | null;
  googleRating: number | null;
  hasGoogleBusinessProfile: boolean | null;
  googleBusinessStatus: string | null;
}

export interface PreScoreResult {
  totalScore: number;
  excluded: boolean;
  excludeReason: string | null;
  breakdown: Record<string, { points: number; reason: string }>;
}

// ─── Legal form codes ───────────────────────────────────────────────────────

const LEGAL_BV = '014';
const LEGAL_NV = '015';
const LEGAL_VOF = '016';
const LEGAL_CV = '017';
const LEGAL_COMMV = '018';
const LEGAL_EENMANSZAAK = '001';
const LEGAL_VZW = '027';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getYearsSinceFounded(foundedDate: string | null): number | null {
  if (!foundedDate) return null;
  const founded = new Date(foundedDate);
  if (isNaN(founded.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - founded.getTime();
  return diffMs / (1000 * 60 * 60 * 24 * 365.25);
}

function getFoundedYear(foundedDate: string | null): number | null {
  if (!foundedDate) return null;
  const founded = new Date(foundedDate);
  if (isNaN(founded.getTime())) return null;
  return founded.getFullYear();
}

// ─── Component scorers ──────────────────────────────────────────────────────

function scoreSpanningssignaal(input: PreScoreInput): { points: number; subBreakdown: Record<string, { points: number; reason: string }> } {
  const subBreakdown: Record<string, { points: number; reason: string }> = {};

  // A. Sector-normalized Review Score (max 20pt)
  let reviewPoints = 0;
  if (input.hasGoogleBusinessProfile === null || input.hasGoogleBusinessProfile === undefined) {
    // No Google data yet (KBO staging) — 0pt
    reviewPoints = 0;
    subBreakdown.reviewScore = { points: 0, reason: 'Geen Google data beschikbaar' };
  } else if (!input.hasGoogleBusinessProfile) {
    // No Google profile
    reviewPoints = 0;
    subBreakdown.reviewScore = { points: 0, reason: 'Geen Google Business profiel' };
  } else if (input.googleReviewCount === null || input.googleReviewCount === 0) {
    // Profile present, 0 reviews
    reviewPoints = 3;
    subBreakdown.reviewScore = { points: 3, reason: 'Google profiel aanwezig, 0 reviews' };
  } else {
    const median = getSectorMedianReviews(input.naceCode);
    const ratio = input.googleReviewCount / median;
    if (ratio < 0.5) {
      reviewPoints = 6;
      subBreakdown.reviewScore = { points: 6, reason: `${input.googleReviewCount} reviews (ratio ${ratio.toFixed(2)} < 0.5 van mediaan ${median})` };
    } else if (ratio <= 1.0) {
      reviewPoints = 10;
      subBreakdown.reviewScore = { points: 10, reason: `${input.googleReviewCount} reviews (ratio ${ratio.toFixed(2)}, rond mediaan ${median})` };
    } else if (ratio <= 2.0) {
      reviewPoints = 15;
      subBreakdown.reviewScore = { points: 15, reason: `${input.googleReviewCount} reviews (ratio ${ratio.toFixed(2)}, boven mediaan ${median})` };
    } else {
      reviewPoints = 20;
      subBreakdown.reviewScore = { points: 20, reason: `${input.googleReviewCount} reviews (ratio ${ratio.toFixed(2)} > 2x mediaan ${median})` };
    }
  }

  // B. Website Absence Bonus (max 15pt)
  let websiteBonus = 0;
  if (!input.website) {
    const hasReviews = input.googleReviewCount !== null && input.googleReviewCount > 0;
    const hasProfile = input.hasGoogleBusinessProfile === true;

    if (hasReviews) {
      websiteBonus = 15;
      subBreakdown.websiteAbsence = { points: 15, reason: 'Geen website + reviews aanwezig — kern profiel' };
    } else if (hasProfile) {
      websiteBonus = 10;
      subBreakdown.websiteAbsence = { points: 10, reason: 'Geen website + Google profiel aanwezig' };
    } else {
      websiteBonus = 3;
      subBreakdown.websiteAbsence = { points: 3, reason: 'Geen website, geen Google aanwezigheid' };
    }
  } else {
    // Has website — neutral, 0pt, no entry needed but we add for transparency
    subBreakdown.websiteAbsence = { points: 0, reason: 'Heeft website (neutraal)' };
  }

  return { points: reviewPoints + websiteBonus, subBreakdown };
}

function scoreSectorFit(naceCode: string | null): { points: number; reason: string } {
  const { tier, score } = getSectorTier(naceCode);
  if (tier === null) {
    return { points: 0, reason: 'Geen NACE code beschikbaar' };
  }
  return { points: score, reason: `Sector tier ${tier} (${score}pt)` };
}

function scoreBedrijfsleeftijd(foundedDate: string | null): { points: number; reason: string } {
  const years = getYearsSinceFounded(foundedDate);
  if (years === null) {
    return { points: 0, reason: 'Geen oprichtingsdatum beschikbaar' };
  }

  if (years >= 3 && years <= 10) {
    return { points: 15, reason: `${Math.floor(years)} jaar oud — sweet spot (3-10j)` };
  } else if (years > 10 && years <= 20) {
    return { points: 11, reason: `${Math.floor(years)} jaar oud — gevestigd (10-20j)` };
  } else if (years >= 1 && years < 3) {
    return { points: 6, reason: `${Math.floor(years)} jaar oud — jong (1-3j)` };
  } else if (years < 1) {
    return { points: 2, reason: `< 1 jaar oud — zeer jong` };
  } else {
    // > 20 years
    return { points: 8, reason: `${Math.floor(years)} jaar oud — traditioneel (> 20j)` };
  }
}

function scoreContactbereikbaarheid(input: PreScoreInput): { points: number; reason: string } {
  let points = 0;
  const parts: string[] = [];

  if (input.email) {
    points += 4;
    parts.push('email (+4)');
  }
  if (input.phone) {
    points += 3;
    parts.push('telefoon (+3)');
  }
  if (input.hasGoogleBusinessProfile === true) {
    points += 2;
    parts.push('Google Business (+2)');
  }

  points = Math.min(points, 8);

  if (parts.length === 0) {
    return { points: 0, reason: 'Geen contactinfo beschikbaar' };
  }
  return { points, reason: parts.join(', ') };
}

function scoreGoogleRating(rating: number | null): { points: number; reason: string } {
  if (rating === null) {
    return { points: 0, reason: 'Geen Google rating beschikbaar' };
  }
  if (rating >= 4.5) {
    return { points: 10, reason: `Rating ${rating} (4.5-5.0 — excellent)` };
  } else if (rating >= 4.0) {
    return { points: 7, reason: `Rating ${rating} (4.0-4.4 — goed)` };
  } else if (rating >= 3.5) {
    return { points: 4, reason: `Rating ${rating} (3.5-3.9 — gemiddeld)` };
  } else {
    return { points: 0, reason: `Rating ${rating} (< 3.5 — laag)` };
  }
}

function scoreRechtsvorm(legalForm: string | null, foundedDate: string | null): { points: number; reason: string } {
  if (!legalForm) {
    return { points: 0, reason: 'Geen rechtsvorm beschikbaar' };
  }

  const foundedYear = getFoundedYear(foundedDate);

  if (legalForm === LEGAL_BV || legalForm === LEGAL_NV) {
    if (foundedYear !== null && foundedYear < 2019) {
      return { points: 5, reason: `BV/NV opgericht vóór 2019 — gevestigd` };
    }
    return { points: 2, reason: `BV/NV opgericht 2019+ — relatief nieuw` };
  }

  if ([LEGAL_EENMANSZAAK, LEGAL_VOF, LEGAL_CV, LEGAL_COMMV].includes(legalForm)) {
    return { points: 3, reason: 'Eenmanszaak/VOF/CV/CommV — snelle beslisser' };
  }

  if (legalForm === LEGAL_VZW) {
    return { points: 0, reason: 'VZW — niet commercieel' };
  }

  // Unknown legal form
  return { points: 0, reason: `Onbekende rechtsvorm (${legalForm})` };
}

// ─── Hard exclusion check ───────────────────────────────────────────────────

function checkExclusion(input: PreScoreInput): string | null {
  // Permanently closed
  if (
    input.googleBusinessStatus === 'CLOSED_PERMANENTLY' ||
    input.googleBusinessStatus === 'CLOSED'
  ) {
    return `Google Business status: ${input.googleBusinessStatus}`;
  }

  // Blacklisted NACE
  if (isNaceBlacklisted(input.naceCode)) {
    return `NACE ${input.naceCode} staat op blacklist`;
  }

  // Completely unreachable: no email, no phone, no GBP, no website
  const hasAnyContact =
    input.email ||
    input.phone ||
    input.hasGoogleBusinessProfile === true ||
    input.website;

  if (!hasAnyContact) {
    return 'Volledig onbereikbaar — geen email, telefoon, Google Business of website';
  }

  return null;
}

// ─── Main scoring function ──────────────────────────────────────────────────

export function computePreScore(input: PreScoreInput): PreScoreResult {
  const breakdown: Record<string, { points: number; reason: string }> = {};

  // Hard exclusion check
  const excludeReason = checkExclusion(input);
  if (excludeReason) {
    return {
      totalScore: 0,
      excluded: true,
      excludeReason,
      breakdown: {},
    };
  }

  // 1. Spanningssignaal (max 35pt)
  const spanning = scoreSpanningssignaal(input);
  breakdown.spanningssignaal = { points: spanning.points, reason: 'Spanningssignaal totaal' };
  // Add sub-breakdown entries
  for (const [key, value] of Object.entries(spanning.subBreakdown)) {
    breakdown[`spanning_${key}`] = value;
  }

  // 2. Sector Fit (max 20pt)
  const sector = scoreSectorFit(input.naceCode);
  breakdown.sectorFit = sector;

  // 3. Bedrijfsleeftijd (max 15pt)
  const leeftijd = scoreBedrijfsleeftijd(input.foundedDate);
  breakdown.bedrijfsleeftijd = leeftijd;

  // 4. Contactbereikbaarheid (max 15pt)
  const contact = scoreContactbereikbaarheid(input);
  breakdown.contactbereikbaarheid = contact;

  // 5. Google Rating (max 10pt)
  const rating = scoreGoogleRating(input.googleRating);
  breakdown.googleRating = rating;

  // 6. Rechtsvorm (max 5pt)
  const recht = scoreRechtsvorm(input.legalForm, input.foundedDate);
  breakdown.rechtsvorm = recht;

  // Sum all component scores
  const totalScore = Math.max(0, Math.min(100,
    spanning.points +
    sector.points +
    leeftijd.points +
    contact.points +
    rating.points +
    recht.points
  ));

  return {
    totalScore,
    excluded: false,
    excludeReason: null,
    breakdown,
  };
}
