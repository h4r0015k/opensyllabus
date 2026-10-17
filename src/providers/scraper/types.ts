export interface ScrapedPage {
  url: string;
  status: number;
  title: string;
  description: string;
  siteName?: string;
  content: string;
  headings: Array<{ level: number; text: string }>;
  jsonLd: Record<string, unknown>[];
  openGraph: Record<string, string>;
  isBlockedOrProtected: boolean;
}

export interface ScraperProvider {
  /**
   * Human-readable unique identifier for this scraper provider.
   */
  readonly name: string;

  /**
   * Fetch and extract readable content, metadata, and JSON-LD from a URL.
   */
  scrape(url: string): Promise<ScrapedPage>;
}
