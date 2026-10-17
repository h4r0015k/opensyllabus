export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchQueryOptions {
  limit?: number;
}

export interface SearchProvider {
  /**
   * Human-readable unique identifier for this search provider (e.g. "brave", "duckduckgo").
   */
  readonly name: string;

  /**
   * Execute a search query and return normalized search result items.
   */
  search(query: string, options?: SearchQueryOptions): Promise<SearchResultItem[]>;
}
