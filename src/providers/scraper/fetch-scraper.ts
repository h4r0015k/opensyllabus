import * as cheerio from 'cheerio';
import type { ScrapedPage, ScraperProvider } from './types.js';

export class FetchScraperProvider implements ScraperProvider {
  readonly name = 'fetch';
  private userAgent: string;

  constructor(options?: { userAgent?: string }) {
    this.userAgent =
      options?.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  }

  async scrape(url: string): Promise<ScrapedPage> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });

    const status = response.status;
    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract OpenGraph tags
    const openGraph: Record<string, string> = {};
    $('meta[property^="og:"], meta[name^="og:"]').each((_, el) => {
      const prop = $(el).attr('property') || $(el).attr('name');
      const val = $(el).attr('content');
      if (prop && val) {
        const key = prop.replace(/^og:/, '');
        openGraph[key] = val;
      }
    });

    // Extract JSON-LD structured data
    const jsonLd: Record<string, unknown>[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const raw = $(el).html();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            jsonLd.push(...parsed);
          } else if (typeof parsed === 'object' && parsed !== null) {
            jsonLd.push(parsed);
          }
        }
      } catch {
        // ignore malformed JSON-LD scripts
      }
    });

    // Extract Title & Description
    const title =
      openGraph['title'] ||
      $('title').first().text().trim() ||
      $('h1').first().text().trim() ||
      '';

    const description =
      openGraph['description'] ||
      $('meta[name="description"]').attr('content')?.trim() ||
      '';

    const siteName = openGraph['site_name'] || '';

    // Bot / Cloudflare / Paywall block detection
    const pageTitleLower = title.toLowerCase();
    const isBlockedOrProtected =
      status === 403 ||
      status === 429 ||
      pageTitleLower.includes('just a moment...') ||
      pageTitleLower.includes('attention required!') ||
      pageTitleLower.includes('cloudflare') ||
      pageTitleLower.includes('access denied') ||
      pageTitleLower.includes('security check');

    // Extract Headings tree
    const headings: Array<{ level: number; text: string }> = [];
    $('h1, h2, h3, h4').each((_, el) => {
      const tag = el.tagName.toLowerCase();
      const level = parseInt(tag.replace('h', ''), 10);
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text.length > 0 && text.length < 200) {
        headings.push({ level, text });
      }
    });

    // Extract Syllabus / Curriculum Content
    // Strip non-content and noisy elements
    $('script, style, noscript, svg, nav, footer, header, form, iframe, button').remove();

    // Look for dedicated syllabus / curriculum sections first
    const syllabusSelectors = [
      '[data-purpose*="curriculum"]',
      '[data-purpose*="course-curriculum"]',
      '[class*="curriculum"]',
      '[class*="syllabus"]',
      '[id*="curriculum"]',
      '[id*="syllabus"]',
      '[class*="modules"]',
      '[class*="course-content"]',
      'main',
      'article',
    ];

    let contentText = '';
    for (const selector of syllabusSelectors) {
      const match = $(selector);
      if (match.length > 0) {
        const text = match.text().trim();
        if (text.length > 200) {
          contentText = text;
          break;
        }
      }
    }

    if (!contentText) {
      contentText = $('body').text().trim();
    }

    // Clean whitespace
    const cleanContent = contentText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

    return {
      url,
      status,
      title,
      description,
      siteName,
      content: cleanContent.slice(0, 40000), // bounded buffer
      headings,
      jsonLd,
      openGraph,
      isBlockedOrProtected,
    };
  }
}
