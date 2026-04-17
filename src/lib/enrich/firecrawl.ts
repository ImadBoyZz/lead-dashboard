// Firecrawl v1 scrape helper. Gedeeld tussen Layer 4 franchise classifier,
// email finder en website-verdict endpoints.
//
// Design: altijd markdown + html return; caller kiest welke nodig. Fouten
// worden niet geworpen — returnt null zodat caller kan besluiten tussen
// fallback (bv. "unknown" classificatie) of DLQ write.

const FIRECRAWL_ENDPOINT = 'https://api.firecrawl.dev/v1/scrape';

// Kost-schatting: Standaard Firecrawl v1 scrape ~€0,003 per call (Growth plan
// €80/mnd = 30k calls). Voor budget tracking: markdown-only scrape zonder
// screenshot. Screenshot endpoint is apart.
export const FIRECRAWL_SCRAPE_COST_EUR = 0.003;

export interface FirecrawlScrapeResult {
  markdown: string;
  html: string | null;
  rawTextLen: number;
  statusCode: number | null;
}

/**
 * Scrape de homepage van een bedrijf. Retry één keer bij 5xx; anders fail-silent
 * en laat caller 'unknown' kiezen. Geen exceptions voor netwerkfouten.
 */
export async function scrapeUrlMarkdown(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<FirecrawlScrapeResult | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn('[firecrawl] FIRECRAWL_API_KEY ontbreekt — scrape skipped');
    return null;
  }

  const body = {
    url,
    formats: ['markdown'],
    onlyMainContent: true,
    timeout: opts?.timeoutMs ?? 20000,
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(FIRECRAWL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout((opts?.timeoutMs ?? 20000) + 5000),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        if (res.status >= 500 && attempt === 1) continue;
        console.warn(`[firecrawl] ${url} → HTTP ${res.status} — ${txt.slice(0, 200)}`);
        return null;
      }

      const data = (await res.json()) as {
        success?: boolean;
        data?: { markdown?: string; html?: string | null; metadata?: { statusCode?: number } };
      };

      const markdown = data?.data?.markdown ?? '';
      if (!markdown) return null;

      return {
        markdown,
        html: data?.data?.html ?? null,
        rawTextLen: markdown.length,
        statusCode: data?.data?.metadata?.statusCode ?? null,
      };
    } catch (err) {
      if (attempt === 1) continue;
      console.error(`[firecrawl] ${url} fetch fout:`, err);
      return null;
    }
  }

  return null;
}
