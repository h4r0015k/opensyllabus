import type {
  ExtractedLesson,
  ExtractedModule,
  ResearcherOptions,
  ResearchResult,
} from '../types/researcher.js';
import type { SearchProvider } from '../providers/search/types.js';
import type { ScraperProvider, ScrapedPage } from '../providers/scraper/types.js';
import { FetchScraperProvider } from '../providers/scraper/fetch-scraper.js';
import { DuckDuckGoSearchProvider } from '../providers/search/duckduckgo.js';

export class Researcher {
  private searchProvider: SearchProvider;
  private scraper: ScraperProvider;
  private llmParser?: ResearcherOptions['llmParser'];
  private enrichWithSearch: boolean;

  constructor(options?: ResearcherOptions) {
    this.searchProvider = options?.searchProvider || new DuckDuckGoSearchProvider();
    this.scraper = options?.scraper || new FetchScraperProvider();
    this.llmParser = options?.llmParser;
    this.enrichWithSearch = options?.enrichWithSearch ?? false;
  }

  /**
   * Researches any course or educational link, extracting all available details,
   * syllabus hierarchy, and covered topics.
   */
  async research(url: string): Promise<ResearchResult> {
    const platform = this.detectPlatform(url);
    let scraped: ScrapedPage | null = null;
    let scrapedSuccessfully = false;
    let searchAugmented = false;
    let searchSnippets: string[] = [];

    // Step 1: Attempt direct scraping
    try {
      scraped = await this.scraper.scrape(url);
      scrapedSuccessfully =
        !scraped.isBlockedOrProtected &&
        scraped.status === 200 &&
        scraped.content.length >= 50;
    } catch {
      scrapedSuccessfully = false;
    }

    const titleFromUrl = this.extractTitleFromUrl(url);
    let resolvedTitle = scraped?.title || titleFromUrl;
    let resolvedDescription = scraped?.description || '';

    // Step 2: Search Augmentation
    // Triggered if direct scrape was blocked/sparse, or if enrichWithSearch is true
    const shouldSearch = !scrapedSuccessfully || this.enrichWithSearch;
    if (shouldSearch) {
      try {
        const query = `${resolvedTitle} syllabus curriculum table of contents`;
        const searchResults = await this.searchProvider.search(query, { limit: 5 });

        if (searchResults.length > 0) {
          searchAugmented = true;
          searchSnippets = searchResults.map((r) => `${r.title}\n${r.snippet}`);
          if (!resolvedDescription && searchResults[0]?.snippet) {
            resolvedDescription = searchResults[0].snippet;
          }
        }
      } catch {
        // Search error gracefully ignored, proceed with available scraped data
      }
    }

    // Step 3: Combine raw text for analysis
    const combinedRawText = [
      scraped?.content || '',
      ...searchSnippets,
    ].filter(Boolean).join('\n\n');

    // Step 4: Extract Structured Metadata & Syllabus
    // If user provided a custom LLM parser hook, use it
    if (this.llmParser) {
      try {
        const llmParsed = await this.llmParser(combinedRawText, {
          url,
          title: resolvedTitle,
        });
        if (llmParsed && Object.keys(llmParsed).length > 0) {
          return this.mergeWithDefaults(llmParsed, {
            sourceUrl: url,
            platform,
            title: resolvedTitle,
            description: resolvedDescription,
            rawSyllabusText: combinedRawText,
            scrapedSuccessfully,
            searchAugmented,
          });
        }
      } catch {
        // Fall back to heuristic parser if LLM hook fails
      }
    }

    // Step 5: Heuristic extraction
    return this.parseHeuristically({
      url,
      platform,
      title: resolvedTitle,
      description: resolvedDescription,
      rawText: combinedRawText,
      headings: scraped?.headings || [],
      jsonLd: scraped?.jsonLd || [],
      scrapedSuccessfully,
      searchAugmented,
    });
  }

  private detectPlatform(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();
      if (host.includes('udemy.com')) return 'Udemy';
      if (host.includes('coursera.org')) return 'Coursera';
      if (host.includes('edx.org')) return 'edX';
      if (host.includes('maven.com')) return 'Maven';
      if (host.includes('frontendmasters.com')) return 'Frontend Masters';
      if (host.includes('pluralsight.com')) return 'Pluralsight';
      if (host.includes('skillshare.com')) return 'Skillshare';
      if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
      if (host.includes('khanacademy.org')) return 'Khan Academy';
      if (host.includes('freecodecamp.org')) return 'freeCodeCamp';
      if (host.includes('codecademy.com')) return 'Codecademy';
      return 'Generic Web';
    } catch {
      return 'Generic Web';
    }
  }

  private extractTitleFromUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      const parts = parsed.pathname
        .split('/')
        .filter(Boolean)
        .filter((part) => !['course', 'courses', 'learn', 'p', 'watch'].includes(part));

      const last = parts.pop() || '';
      return last
        .replace(/[-_]/g, ' ')
        .replace(/\.html?$/i, '')
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ') || 'Online Course';
    } catch {
      return 'Online Course';
    }
  }

  private parseHeuristically(context: {
    url: string;
    platform: string;
    title: string;
    description: string;
    rawText: string;
    headings: Array<{ level: number; text: string }>;
    jsonLd: Record<string, unknown>[];
    scrapedSuccessfully: boolean;
    searchAugmented: boolean;
  }): ResearchResult {
    const { url, platform, title, description, rawText, headings, jsonLd, scrapedSuccessfully, searchAugmented } =
      context;

    // Check JSON-LD for official schema.org/Course data
    let instructor: string | undefined;
    let difficulty: ResearchResult['difficulty'];
    let duration: string | undefined;

    for (const item of jsonLd) {
      if (item['@type'] === 'Course' || item['@type'] === 'EducationalOccupationalCredential') {
        if (typeof item['name'] === 'string' && !title) {
          // fallback title
        }
        if (item['author'] && typeof item['author'] === 'object') {
          const authObj = item['author'] as Record<string, unknown>;
          if (typeof authObj['name'] === 'string') instructor = authObj['name'];
        }
        if (typeof item['educationalLevel'] === 'string') {
          difficulty = this.normalizeDifficulty(item['educationalLevel']);
        }
        if (typeof item['timeRequired'] === 'string') {
          duration = item['timeRequired'];
        }
      }
    }

    // Extract modules and lessons from headings or bullet points
    const modules: ExtractedModule[] = [];
    const keyTopics: string[] = [];
    const prerequisites: string[] = [];
    const targetAudience: string[] = [];

    // Analyze headings
    let currentModule: ExtractedModule | null = null;
    let moduleOrder = 1;
    let lessonOrder = 1;

    for (const h of headings) {
      const lower = h.text.toLowerCase();
      // Detect prerequisites / audience sections
      if (lower.includes('prerequisite') || lower.includes('requirements')) {
        continue;
      }
      if (lower.includes('who this course is for') || lower.includes('target audience')) {
        continue;
      }

      // Group into modules and lessons by heading level
      if (h.level === 2 || h.text.match(/^(module|section|chapter|part)\s+\d+/i)) {
        currentModule = {
          order: moduleOrder++,
          title: h.text,
          lessons: [],
        };
        modules.push(currentModule);
        lessonOrder = 1;
      } else if (h.level >= 3 && currentModule) {
        currentModule.lessons.push({
          order: lessonOrder++,
          title: h.text,
          learningPoints: [],
        });
        keyTopics.push(h.text);
      }
    }

    // Fallback: If no structured headings detected, parse raw lines
    if (modules.length === 0) {
      const lines = rawText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 5 && l.length < 120);

      const defaultModule: ExtractedModule = {
        order: 1,
        title: 'Core Curriculum',
        lessons: [],
      };

      let count = 1;
      for (const line of lines) {
        if (
          line.match(/^(module|section|chapter|part|\d+\.)/i) ||
          line.includes(':') ||
          line.startsWith('-') ||
          line.startsWith('•')
        ) {
          const cleanTitle = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
          defaultModule.lessons.push({
            order: count++,
            title: cleanTitle,
            learningPoints: [],
          });
          keyTopics.push(cleanTitle);
          if (count > 25) break; // keep reasonable
        }
      }

      if (defaultModule.lessons.length > 0) {
        modules.push(defaultModule);
      }
    }

    // Extract keywords as topics if empty
    if (keyTopics.length === 0) {
      const words = title
        .split(/[\s:,-]+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 3 && !['with', 'from', 'complete', 'bootcamp', 'course', 'guide'].includes(w.toLowerCase()));
      keyTopics.push(...words);
    }

    return {
      sourceUrl: url,
      title: title || 'Course Syllabus',
      platform,
      instructor,
      description: description || `Comprehensive syllabus for ${title}`,
      difficulty: difficulty || 'All Levels',
      estimatedDuration: duration,
      prerequisites,
      targetAudience,
      modules,
      keyTopics: Array.from(new Set(keyTopics)).slice(0, 30),
      rawSyllabusText: rawText,
      metadata: {
        scrapedSuccessfully,
        searchAugmented,
        searchProviderUsed: searchAugmented ? this.searchProvider.name : undefined,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private normalizeDifficulty(diffStr: string): ResearchResult['difficulty'] {
    const lower = diffStr.toLowerCase();
    if (lower.includes('begin')) return 'Beginner';
    if (lower.includes('inter')) return 'Intermediate';
    if (lower.includes('adv')) return 'Advanced';
    return 'All Levels';
  }

  private mergeWithDefaults(
    partial: Partial<ResearchResult>,
    defaults: {
      sourceUrl: string;
      platform: string;
      title: string;
      description: string;
      rawSyllabusText: string;
      scrapedSuccessfully: boolean;
      searchAugmented: boolean;
    }
  ): ResearchResult {
    return {
      sourceUrl: partial.sourceUrl || defaults.sourceUrl,
      title: partial.title || defaults.title,
      platform: partial.platform || defaults.platform,
      instructor: partial.instructor,
      description: partial.description || defaults.description,
      difficulty: partial.difficulty || 'All Levels',
      estimatedDuration: partial.estimatedDuration,
      prerequisites: partial.prerequisites || [],
      targetAudience: partial.targetAudience || [],
      modules: partial.modules || [],
      keyTopics: partial.keyTopics || [],
      rawSyllabusText: defaults.rawSyllabusText,
      metadata: {
        scrapedSuccessfully: defaults.scrapedSuccessfully,
        searchAugmented: defaults.searchAugmented,
        searchProviderUsed: defaults.searchAugmented ? this.searchProvider.name : undefined,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
