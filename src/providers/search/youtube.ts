import type { SearchProvider, SearchQueryOptions, SearchResultItem } from './types.js';

export interface YouTubeSearchOptions {
  userAgent?: string;
}

export class YouTubeSearchProvider implements SearchProvider {
  readonly name = 'youtube';
  private userAgent: string;

  constructor(options?: YouTubeSearchOptions) {
    this.userAgent =
      options?.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
  }

  async search(query: string, options?: SearchQueryOptions): Promise<SearchResultItem[]> {
    const limit = options?.limit ?? 5;
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`YouTube search error (${response.status}): ${response.statusText}`);
    }

    const html = await response.text();
    return this.parseInitialData(html, limit);
  }

  private parseInitialData(html: string, limit: number): SearchResultItem[] {
    const results: SearchResultItem[] = [];

    // Extract ytInitialData JSON blob from script tag
    const match =
      html.match(/var ytInitialData = ({.*?});<\/script>/s) ||
      html.match(/ytInitialData\s*=\s*({.*?});/s);

    if (match && match[1]) {
      try {
        const data = JSON.parse(match[1]) as Record<string, any>;
        const sections =
          data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

        for (const section of sections) {
          const items = section?.itemSectionRenderer?.contents || [];
          for (const item of items) {
            if (results.length >= limit) break;

            const video = item.videoRenderer;
            if (video && video.videoId) {
              const videoId = video.videoId;
              const title = video.title?.runs?.[0]?.text || video.title?.simpleText || '';
              const channel = video.ownerText?.runs?.[0]?.text || '';
              const length = video.lengthText?.simpleText || '';
              const snippet = video.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join('') ||
                video.descriptionSnippet?.runs?.map((r: any) => r.text).join('') ||
                `Video tutorial by ${channel}${length ? ` (${length})` : ''}`;

              if (title) {
                results.push({
                  title,
                  url: `https://www.youtube.com/watch?v=${videoId}`,
                  snippet: `${channel ? `[${channel}] ` : ''}${snippet}${length ? ` • ${length}` : ''}`,
                });
              }
            }
          }
        }
      } catch {
        // Fallback to regex parser if JSON.parse fails
      }
    }

    // Regex fallback if ytInitialData schema shifted
    if (results.length === 0) {
      const regex = /"videoId":"([a-zA-Z0-9_-]{11})".*?"title":{"runs":\[{"text":"(.*?)"}\]/g;
      let m;
      while ((m = regex.exec(html)) !== null && results.length < limit) {
        const videoId = m[1];
        const title = m[2].replace(/\\u0026/g, '&');
        results.push({
          title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          snippet: 'YouTube video lecture',
        });
      }
    }

    return results;
  }
}
