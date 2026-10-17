import * as cheerio from 'cheerio';
import type { SearchProvider, SearchQueryOptions, SearchResultItem } from './types.js';

export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly name = 'duckduckgo';

  async search(query: string, options?: SearchQueryOptions): Promise<SearchResultItem[]> {
    const limit = options?.limit ?? 5;
    const url = 'https://html.duckduckgo.com/html/';

    const body = new URLSearchParams({ q: query });
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo search error (${response.status}): ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: SearchResultItem[] = [];

    $('.result').each((_, element) => {
      if (results.length >= limit) return false;

      const titleElem = $(element).find('.result__title a');
      const snippetElem = $(element).find('.result__snippet');

      const title = titleElem.text().trim();
      let rawHref = titleElem.attr('href') || '';
      const snippet = snippetElem.text().trim();

      // DuckDuckGo redirects often look like: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com...
      let destinationUrl = rawHref;
      if (rawHref.includes('uddg=')) {
        try {
          const match = rawHref.match(/uddg=([^&]+)/);
          if (match && match[1]) {
            destinationUrl = decodeURIComponent(match[1]);
          }
        } catch {
          // fallback to rawHref if decoding fails
        }
      }

      if (destinationUrl.startsWith('//')) {
        destinationUrl = `https:${destinationUrl}`;
      }

      if (title && destinationUrl && destinationUrl.startsWith('http')) {
        results.push({
          title,
          url: destinationUrl,
          snippet,
        });
      }
    });

    return results;
  }
}
