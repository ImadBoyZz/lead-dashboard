import type { Browser, Page } from 'playwright';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MapsScrapedBusiness {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  hasGoogleAds: boolean;
  googleMapsUrl: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseRatingFromAriaLabel(ariaLabel: string | null): number | null {
  if (!ariaLabel) return null;
  // Patterns: "4,5 sterren" or "4.5 stars" or "Beoordeeld met 4,3 van 5"
  const match = ariaLabel.match(/([\d]+[.,][\d]+)\s*(sterren|stars|van)/i)
    ?? ariaLabel.match(/([\d]+[.,][\d]+)/);
  if (match) {
    return parseFloat(match[1].replace(',', '.'));
  }
  return null;
}

function parseReviewCount(text: string | null): number | null {
  if (!text) return null;
  // Patterns: "(123)", "123 reviews", "123 beoordelingen"
  const match = text.match(/\(?([\d.]+)\)?/);
  if (match) {
    return parseInt(match[1].replace(/\./g, ''), 10);
  }
  return null;
}

async function autoScroll(page: Page, scrollContainerSelector: string, maxScrolls: number): Promise<void> {
  for (let i = 0; i < maxScrolls; i++) {
    const scrolled = await page.evaluate((selector) => {
      const container = document.querySelector(selector);
      if (!container) return false;
      const prevScrollTop = container.scrollTop;
      container.scrollBy(0, 800);
      return container.scrollTop !== prevScrollTop;
    }, scrollContainerSelector);

    if (!scrolled) break;
    // Wait for new results to load
    await page.waitForTimeout(1200);
  }
}

// ─── Main scraper ──────────────────────────────────────────────────────────

export async function scrapeGoogleMaps(
  query: string,
  maxResults: number = 20,
): Promise<MapsScrapedBusiness[]> {
  let browser: Browser | null = null;

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
      locale: 'nl-BE',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // Navigate to Google Maps search
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Accept cookie consent if it appears
    try {
      const consentButton = page.locator('button:has-text("Alles accepteren"), button:has-text("Accept all")');
      await consentButton.click({ timeout: 3000 });
      await page.waitForTimeout(1000);
    } catch {
      // No consent dialog, continue
    }

    // Wait for the results feed to appear
    const feedSelector = 'div[role="feed"]';
    try {
      await page.waitForSelector(feedSelector, { timeout: 10000 });
    } catch {
      console.warn('No results feed found — the query may have returned 0 results or redirected to a single result.');
      // Check if we landed on a single business page
      const singleResult = await extractSingleResult(page);
      if (singleResult) return [singleResult];
      return [];
    }

    // Scroll to load more results
    const maxScrolls = Math.ceil(maxResults / 7) + 3; // ~7 results per scroll
    await autoScroll(page, feedSelector, maxScrolls);

    // Extract all result items
    const resultItems = page.locator(`${feedSelector} > div`);
    const count = await resultItems.count();
    const results: MapsScrapedBusiness[] = [];

    for (let i = 0; i < Math.min(count, maxResults); i++) {
      try {
        const item = resultItems.nth(i);
        const result = await extractResultItem(item);
        if (result) {
          results.push(result);
        }
      } catch {
        // Skip items that fail to parse
        continue;
      }
    }

    return results;
  } catch (error) {
    console.error('Google Maps scraper error:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ─── Extraction helpers ────────────────────────────────────────────────────

async function extractResultItem(
  item: import('playwright').Locator,
): Promise<MapsScrapedBusiness | null> {
  // Get the main link element (contains most data)
  const linkEl = item.locator('a[href*="/maps/place/"]').first();
  const linkExists = (await linkEl.count()) > 0;

  if (!linkExists) return null;

  // Name — from the aria-label of the main link or the heading inside
  const ariaLabel = await linkEl.getAttribute('aria-label');
  const name = ariaLabel?.trim() || null;
  if (!name) return null;

  // Google Maps URL
  const href = await linkEl.getAttribute('href');
  const googleMapsUrl = href || null;

  // Check for "Gesponsord" / "Sponsored" tag
  const itemText = await item.textContent() ?? '';
  const hasGoogleAds =
    itemText.includes('Gesponsord') ||
    itemText.includes('Sponsored') ||
    itemText.includes('Ad ·');

  // Rating from stars element
  const starsEl = item.locator('span[role="img"]').first();
  let rating: number | null = null;
  if ((await starsEl.count()) > 0) {
    const starsAriaLabel = await starsEl.getAttribute('aria-label');
    rating = parseRatingFromAriaLabel(starsAriaLabel);
  }

  // Review count — usually in parentheses right after the stars
  let reviewCount: number | null = null;
  const reviewTexts = await item.locator('span').allTextContents();
  for (const text of reviewTexts) {
    if (/\(\d+/.test(text)) {
      reviewCount = parseReviewCount(text);
      if (reviewCount !== null) break;
    }
  }

  // Address, phone, website — these are in separate divs below the name
  // They are typically in the second/third/fourth lines of text
  let address: string | null = null;
  let phone: string | null = null;
  let website: string | null = null;

  const allTexts = await item.locator('div, span').allTextContents();
  for (const text of allTexts) {
    const trimmed = text.trim();
    if (!trimmed || trimmed === name) continue;

    // Phone pattern (Belgian/Dutch numbers)
    if (!phone && /^(\+?\d[\d\s\-/.]{7,})$/.test(trimmed)) {
      phone = trimmed.replace(/\s+/g, ' ').trim();
      continue;
    }

    // Website pattern
    if (!website && /^(www\.|https?:\/\/)/.test(trimmed)) {
      website = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      continue;
    }

    // Address heuristic: contains a number + text, looks like a street address
    if (!address && /\d/.test(trimmed) && trimmed.length > 5 && trimmed.length < 120) {
      // Check it looks like an address (has a comma or street-like pattern)
      if (/,/.test(trimmed) || /\d{4}/.test(trimmed) || /straat|laan|weg|plein|dreef|steenweg/i.test(trimmed)) {
        address = trimmed;
      }
    }
  }

  return {
    name,
    address,
    phone,
    website,
    rating,
    reviewCount,
    hasGoogleAds,
    googleMapsUrl,
  };
}

async function extractSingleResult(page: import('playwright').Page): Promise<MapsScrapedBusiness | null> {
  try {
    // On a single business page, extract what we can
    const nameEl = page.locator('h1').first();
    const name = (await nameEl.textContent())?.trim() || null;
    if (!name) return null;

    const url = page.url();

    // Rating
    let rating: number | null = null;
    const ratingEl = page.locator('div[role="img"][aria-label*="sterren"], div[role="img"][aria-label*="stars"]').first();
    if ((await ratingEl.count()) > 0) {
      rating = parseRatingFromAriaLabel(await ratingEl.getAttribute('aria-label'));
    }

    // Review count
    let reviewCount: number | null = null;
    const reviewEl = page.locator('button[aria-label*="review"], button[aria-label*="beoordeling"]').first();
    if ((await reviewEl.count()) > 0) {
      const reviewText = await reviewEl.textContent();
      reviewCount = parseReviewCount(reviewText);
    }

    // Address
    let address: string | null = null;
    const addressButton = page.locator('button[data-item-id="address"]').first();
    if ((await addressButton.count()) > 0) {
      address = (await addressButton.textContent())?.trim() || null;
    }

    // Phone
    let phone: string | null = null;
    const phoneButton = page.locator('button[data-item-id*="phone"]').first();
    if ((await phoneButton.count()) > 0) {
      phone = (await phoneButton.textContent())?.trim() || null;
    }

    // Website
    let website: string | null = null;
    const websiteLink = page.locator('a[data-item-id="authority"]').first();
    if ((await websiteLink.count()) > 0) {
      website = await websiteLink.getAttribute('href');
    }

    return {
      name,
      address,
      phone,
      website,
      rating,
      reviewCount,
      hasGoogleAds: false,
      googleMapsUrl: url,
    };
  } catch {
    return null;
  }
}
