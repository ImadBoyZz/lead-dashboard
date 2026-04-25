// Tiered website-health signalen. SSL + PageSpeed eerst (gratis / goedkoop).
// Opus visual-age check alleen als tiebreaker, wanneer signalen niet eenduidig zijn.

import { scrapeUrlMarkdown } from './firecrawl';
import { env } from '@/lib/env';

export interface WebsiteSignals {
  reachable: boolean;
  httpStatus: number | null;
  hasSsl: boolean;
  pagespeedMobile: number | null;
  contentLength: number;
  parked: boolean;
  title: string | null;
  errorMessage: string | null;
}

// Parked-domain heuristiek: korte content + trefwoorden op parking pagina's.
const PARKED_KEYWORDS = [
  'domain is for sale',
  'buy this domain',
  'parkingcrew',
  'sedoparking',
  'afternic',
  'godaddy domain',
  'domein is te koop',
  'gereserveerd domein',
];

/**
 * Collecteer basissignalen: reachable, SSL, PageSpeed mobile, parked-check.
 * Geen LLM nodig. Totaal ~2-3s per call. Kost: PageSpeed = gratis tier.
 */
export async function collectWebsiteSignals(website: string): Promise<WebsiteSignals> {
  const normalized = normalizeUrl(website);
  if (!normalized) {
    return {
      reachable: false,
      httpStatus: null,
      hasSsl: false,
      pagespeedMobile: null,
      contentLength: 0,
      parked: false,
      title: null,
      errorMessage: 'Ongeldige URL',
    };
  }

  const isHttps = normalized.startsWith('https://');

  // HEAD/GET check — volgt redirects, korte timeout.
  let reachable = false;
  let httpStatus: number | null = null;
  let hasSsl = false;
  let errorMessage: string | null = null;
  let contentLength = 0;
  let parked = false;
  let title: string | null = null;

  try {
    const res = await fetch(normalized, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'AverisLeadBot/1.0 (+https://averissolutions.be)' },
    });
    httpStatus = res.status;
    reachable = res.ok;
    hasSsl = isHttps && res.ok;

    if (res.ok) {
      const body = await res.text().catch(() => '');
      contentLength = body.length;
      const titleMatch = body.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
      title = titleMatch?.[1]?.trim() ?? null;
      const lower = body.toLowerCase();
      parked =
        (contentLength < 2500 && PARKED_KEYWORDS.some((k) => lower.includes(k))) ||
        PARKED_KEYWORDS.some((k) => lower.includes(k));
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // PageSpeed mobile (publieke API, geen key nodig voor gratis tier).
  const pagespeedMobile = await fetchPagespeedMobile(normalized);

  return {
    reachable,
    httpStatus,
    hasSsl,
    pagespeedMobile,
    contentLength,
    parked,
    title,
    errorMessage,
  };
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

async function fetchPagespeedMobile(url: string): Promise<number | null> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY ?? '';
  const qs = new URLSearchParams({ url, strategy: 'mobile' });
  if (apiKey) qs.set('key', apiKey);

  try {
    const res = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs.toString()}`,
      { signal: AbortSignal.timeout(45000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const score = data?.lighthouseResult?.categories?.performance?.score;
    if (typeof score === 'number') return Math.round(score * 100);
    return null;
  } catch (err) {
    console.warn('[pagespeed] fout:', err instanceof Error ? err.message : err);
    return null;
  }
}

export type WebsiteVerdict = 'none' | 'parked' | 'outdated' | 'acceptable' | 'modern';

export interface VerdictFromSignals {
  verdict: WebsiteVerdict;
  needsTiebreaker: boolean;
  reason: string;
}

/**
 * Beslis verdict uit signalen. Tiebreaker-zone: SSL ok + mobile 30-69 (modern vs outdated).
 * ~70-80% van de leads valt NIET in de tiebreaker-zone → bespaart Opus calls.
 */
export function decideFromSignals(signals: WebsiteSignals): VerdictFromSignals {
  if (!signals.reachable && signals.errorMessage) {
    return {
      verdict: 'none',
      needsTiebreaker: false,
      reason: `Onbereikbaar: ${signals.errorMessage}`,
    };
  }

  if (signals.parked) {
    return { verdict: 'parked', needsTiebreaker: false, reason: 'Parked / te-koop pagina gedetecteerd' };
  }

  if (!signals.hasSsl && signals.httpStatus !== 200) {
    return { verdict: 'outdated', needsTiebreaker: false, reason: 'Geen SSL + HTTP fail' };
  }

  const mobile = signals.pagespeedMobile;

  if (!signals.hasSsl) {
    return { verdict: 'outdated', needsTiebreaker: false, reason: 'Geen SSL certificaat' };
  }

  if (mobile === null) {
    // PageSpeed gaf niks — bij tiebreaker uit fallback naar 'outdated' (warm-funnel doorlaat).
    if (!env.TIEBREAKER_ENABLED) {
      return { verdict: 'outdated', needsTiebreaker: false, reason: 'PageSpeed gaf geen score (tiebreaker disabled)' };
    }
    return {
      verdict: 'acceptable',
      needsTiebreaker: true,
      reason: 'SSL ok maar PageSpeed leverde geen score — visuele check nodig',
    };
  }

  if (mobile < 30) {
    return { verdict: 'outdated', needsTiebreaker: false, reason: `Mobile PageSpeed ${mobile}/100` };
  }

  if (mobile >= 70) {
    return { verdict: 'modern', needsTiebreaker: false, reason: `Mobile PageSpeed ${mobile}/100 + SSL` };
  }

  // 30-69: tiebreaker-zone — als tiebreaker uit, fallback naar 'outdated' (warm-funnel doorlaat)
  if (!env.TIEBREAKER_ENABLED) {
    return { verdict: 'outdated', needsTiebreaker: false, reason: `Mobile ${mobile}/100 (tiebreaker disabled)` };
  }
  return {
    verdict: 'acceptable',
    needsTiebreaker: true,
    reason: `Mobile ${mobile}/100 — visuele check kan verdict verfijnen`,
  };
}

/**
 * Herbruikt de bestaande scrape helper om homepage markdown te halen, zodat
 * de visual-age tiebreaker ook beschrijving/tekst kan gebruiken (niet alleen
 * screenshot).
 */
export async function fetchHomepageForTiebreaker(url: string): Promise<string | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  const scraped = await scrapeUrlMarkdown(normalized, { timeoutMs: 15000 });
  return scraped?.markdown ?? null;
}
