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
  /** Moderne tech-indicators gedetecteerd in HTML body + headers. 3+ = hard 'modern'. */
  modernIndicators: string[];
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
 * Detect moderne tech-fingerprints in homepage HTML + response headers.
 * Returns lijst van gevonden markers (bv. ['next.js', 'cloudflare', 'srcset']).
 * Bij 3+ markers wordt site geclassificeerd als 'modern' zonder LLM-call.
 */
function detectModernIndicators(body: string, headers: Headers): string[] {
  const found: string[] = [];
  const lower = body.toLowerCase();

  // Modern frameworks via meta generator of script paths
  if (/<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*webflow/i.test(body)) found.push('webflow');
  if (/<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*wix/i.test(body)) found.push('wix');
  if (/<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*squarespace/i.test(body)) found.push('squarespace');
  if (/<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*shopify/i.test(body)) found.push('shopify');
  if (/<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*ghost/i.test(body)) found.push('ghost');
  if (/\/_next\/|__next|next\.js/i.test(body)) found.push('next.js');
  if (/_nuxt\/|nuxt\.js/i.test(body)) found.push('nuxt');
  if (/data-react|react-root|reactroot|__react/i.test(body)) found.push('react');
  if (/data-v-[0-9a-f]{8}|vue\.js/i.test(body)) found.push('vue');
  if (/astro-island|data-astro/i.test(body)) found.push('astro');
  if (/svelte-[a-z0-9]{6}/i.test(body)) found.push('svelte');
  if (/framer\.com|framerusercontent/i.test(lower)) found.push('framer');

  // Modern image handling
  if (/srcset=/i.test(body)) found.push('srcset');
  if (/<picture[\s>]/i.test(body)) found.push('picture-tag');

  // Modern viewport + responsive
  if (/<meta[^>]+name=["']viewport["'][^>]*width=device-width/i.test(body)) found.push('viewport-meta');

  // Modern OG / structured data
  if (/<meta[^>]+property=["']og:image/i.test(body)) found.push('og-tags');
  if (/application\/ld\+json/i.test(body)) found.push('structured-data');

  // Tailwind density (utility classes met ≥4 short tokens, ≥30 unieke voorvallen)
  const classMatches = body.match(/class=["'][^"']{30,200}["']/gi) ?? [];
  const tailwindLikeCount = classMatches.filter((c) => {
    const tokens = c.replace(/^class=["']/, '').replace(/["']$/, '').split(/\s+/);
    const utility = tokens.filter((t) => /^(flex|grid|gap-|p[xy]?-|m[xy]?-|text-|bg-|border|rounded|shadow|min-|max-|w-|h-)/i.test(t));
    return utility.length >= 4;
  }).length;
  if (tailwindLikeCount >= 8) found.push('tailwind-density');

  // CDN headers (modern hosting infra)
  const server = (headers.get('server') ?? '').toLowerCase();
  const xPoweredBy = (headers.get('x-powered-by') ?? '').toLowerCase();
  if (headers.get('cf-ray')) found.push('cloudflare');
  if (headers.get('x-vercel-id')) found.push('vercel');
  if (headers.get('x-amz-cf-id') || /amazon|cloudfront/.test(server)) found.push('aws-cloudfront');
  if (/netlify/.test(server)) found.push('netlify');
  if (xPoweredBy.includes('next.js') && !found.includes('next.js')) found.push('next.js');

  return [...new Set(found)];
}

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
      modernIndicators: [],
    };
  }

  // HEAD/GET check — volgt redirects, korte timeout.
  let reachable = false;
  let httpStatus: number | null = null;
  let hasSsl = false;
  let errorMessage: string | null = null;
  let contentLength = 0;
  let parked = false;
  let title: string | null = null;
  let modernIndicators: string[] = [];

  try {
    const res = await fetch(normalized, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'AverisLeadBot/1.0 (+https://averissolutions.be)' },
    });
    httpStatus = res.status;
    reachable = res.ok;
    // Check final URL na redirects — een http-URL die redirect naar https heeft wel SSL.
    hasSsl = res.url.startsWith('https://') && res.ok;

    if (res.ok) {
      const body = await res.text().catch(() => '');
      contentLength = body.length;
      const titleMatch = body.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
      title = titleMatch?.[1]?.trim() ?? null;
      const lower = body.toLowerCase();
      parked =
        (contentLength < 2500 && PARKED_KEYWORDS.some((k) => lower.includes(k))) ||
        PARKED_KEYWORDS.some((k) => lower.includes(k));
      modernIndicators = detectModernIndicators(body, res.headers);
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
    modernIndicators,
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

  // Hard exclusion: 3+ moderne tech-indicators = direct 'modern', skip tiebreaker.
  // Dit pakt Webflow/Wix/Squarespace/Next.js sites af die anders ten onrechte
  // door PageSpeed-zone vallen (false positives zoals Rensol, Saninetto).
  if (signals.modernIndicators.length >= 3) {
    return {
      verdict: 'modern',
      needsTiebreaker: false,
      reason: `Moderne tech gedetecteerd: ${signals.modernIndicators.join(', ')}`,
    };
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
