import type { SearchProvider, SearchQueryOptions, SearchResultItem } from './types.js';

export interface BraveSearchOptions {
  apiKey: string;
  endpoint?: string;
}

export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave';
  private apiKey: string;
  private endpoint: string;

  constructor(options: BraveSearchOptions) {
    if (!options?.apiKey) {
      throw new Error('BraveSearchProvider requires a valid apiKey.');
    }
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint || 'https://api.search.brave.com/res/v1/web/search';
  }

  async search(query: string, options?: SearchQueryOptions): Promise<SearchResultItem[]> {
    const limit = options?.limit ?? 5;
    const url = new URL(this.endpoint);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(limit, 20)));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': this.apiKey,
        'User-Agent': 'OpenSyllabus/0.1.0',
      },
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Brave Search API error (${response.status}): ${errText || response.statusText}`);
    }

    const data = await response.json() as {
      web?: {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
        }>;
      };
    };

    const rawResults = data.web?.results || [];
    return rawResults.map((item) => ({
      title: item.title || '',
      url: item.url || '',
      snippet: item.description || '',
    })).filter((item) => item.url.length > 0);
  }
}
