export interface ExtractedLesson {
  order: number;
  title: string;
  learningPoints: string[];
  duration?: string;
}

export interface ExtractedModule {
  order: number;
  title: string;
  description?: string;
  lessons: ExtractedLesson[];
}

export interface ResearchResult {
  sourceUrl: string;
  title: string;
  platform: string; // e.g. "Udemy", "Coursera", "Maven", "edX", "YouTube", "Generic Web"
  instructor?: string;
  description: string;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced' | 'All Levels';
  estimatedDuration?: string;
  prerequisites: string[];
  targetAudience: string[];
  modules: ExtractedModule[];
  keyTopics: string[];
  rawSyllabusText?: string;
  metadata: {
    scrapedSuccessfully: boolean;
    searchAugmented: boolean;
    searchProviderUsed?: string;
    timestamp: string;
  };
}

export interface ResearcherOptions {
  searchProvider?: import('../providers/search/types.js').SearchProvider;
  scraper?: import('../providers/scraper/types.js').ScraperProvider;
  llmParser?: (
    rawText: string,
    context: { url: string; title: string }
  ) => Promise<Partial<ResearchResult>>;
  enrichWithSearch?: boolean;
  timeoutMs?: number;
}
