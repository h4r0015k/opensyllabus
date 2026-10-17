import type { ResearchResult, ExtractedLesson, ExtractedModule } from '../types/researcher.js';
import type { SearchProvider } from '../providers/search/types.js';
import { YouTubeSearchProvider } from '../providers/search/youtube.js';
import { DuckDuckGoSearchProvider } from '../providers/search/duckduckgo.js';
import { QueryGenerator } from './query-generator.js';
import type {
  LessonCandidatePool,
  ResourceCandidate,
  ResourceType,
  SearcherOptions,
  SearcherResult,
} from './types.js';

export class Searcher {
  private videoProvider: SearchProvider;
  private readingProvider: SearchProvider;
  private queryGenerator: QueryGenerator;
  private concurrency: number;
  private delayMs: number;
  private maxCandidatesPerLesson: number;

  constructor(options?: SearcherOptions) {
    this.videoProvider = options?.videoProvider || options?.searchProvider || new YouTubeSearchProvider();
    this.readingProvider = options?.readingProvider || options?.searchProvider || new DuckDuckGoSearchProvider();
    this.queryGenerator = new QueryGenerator();
    this.concurrency = Math.max(1, options?.concurrency ?? 2);
    this.delayMs = options?.delayMs ?? 50;
    this.maxCandidatesPerLesson = options?.maxCandidatesPerLesson ?? 6;
  }

  /**
   * Searches candidates for all lessons in a researched course.
   */
  async searchCandidates(course: ResearchResult): Promise<SearcherResult> {
    const startTime = Date.now();
    let totalQueriesExecuted = 0;
    let totalCandidatesFound = 0;

    // Flatten all lessons with their module context
    const flatLessons: Array<{
      module: ExtractedModule;
      lesson: ExtractedLesson;
    }> = [];

    for (const module of course.modules) {
      if (!module.lessons || module.lessons.length === 0) {
        flatLessons.push({
          module,
          lesson: { order: 1, title: module.title, learningPoints: [] },
        });
      } else {
        for (const lesson of module.lessons) {
          flatLessons.push({ module, lesson });
        }
      }
    }

    // Process with controlled concurrency
    const lessonPools: LessonCandidatePool[] = [];
    const queue = [...flatLessons];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        const { module, lesson } = item;
        const queries = this.queryGenerator.generate({
          courseTitle: course.title,
          moduleTitle: module.title,
          lessonTitle: lesson.title,
          learningPoints: lesson.learningPoints,
          keyTopics: course.keyTopics,
        });

        const candidates: ResourceCandidate[] = [];

        // 1. Search Video Candidates
        try {
          totalQueriesExecuted++;
          const videoResults = await this.videoProvider.search(queries.videoQuery, {
            limit: Math.ceil(this.maxCandidatesPerLesson / 2),
          });

          for (const item of videoResults) {
            candidates.push(this.normalizeCandidate(item, 'video', this.videoProvider.name));
          }
        } catch {
          // Gracefully continue if video search fails for this lesson
        }

        // 2. Search Reading / Documentation Candidates
        try {
          totalQueriesExecuted++;
          const readingResults = await this.readingProvider.search(queries.readingQuery, {
            limit: Math.ceil(this.maxCandidatesPerLesson / 2),
          });

          for (const item of readingResults) {
            const detectedType = this.detectResourceType(item.url);
            candidates.push(this.normalizeCandidate(item, detectedType, this.readingProvider.name));
          }
        } catch {
          // Gracefully continue if reading search fails for this lesson
        }

        // Deduplicate candidates by normalized URL
        const deduplicated = this.deduplicateCandidates(candidates).slice(
          0,
          this.maxCandidatesPerLesson
        );

        totalCandidatesFound += deduplicated.length;

        lessonPools.push({
          moduleOrder: module.order,
          moduleTitle: module.title,
          lessonOrder: lesson.order,
          lessonTitle: lesson.title,
          learningPoints: lesson.learningPoints,
          candidates: deduplicated,
        });

        // Add throttle delay between tasks
        if (this.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.delayMs));
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(this.concurrency, flatLessons.length || 1) },
      () => worker()
    );

    await Promise.all(workers);

    // Re-sort pools in original order
    lessonPools.sort((a, b) => {
      if (a.moduleOrder !== b.moduleOrder) {
        return a.moduleOrder - b.moduleOrder;
      }
      return a.lessonOrder - b.lessonOrder;
    });

    return {
      courseTitle: course.title,
      totalLessons: flatLessons.length,
      lessons: lessonPools,
      stats: {
        totalQueriesExecuted,
        totalCandidatesFound,
        durationMs: Date.now() - startTime,
      },
    };
  }

  private detectResourceType(urlStr: string): ResourceType {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();

      if (host.includes('youtube.com') || host.includes('youtu.be') || host.includes('vimeo.com')) {
        return 'video';
      }

      if (host === 'github.com' || host === 'gitlab.com') {
        return 'github';
      }

      if (
        host.includes('developer.mozilla.org') ||
        host.includes('docs.') ||
        host.endsWith('.readthedocs.io') ||
        path.includes('/docs/') ||
        path.includes('/documentation/') ||
        host.includes('devdocs.io') ||
        host === 'react.dev' ||
        host === 'python.org' ||
        host === 'nodejs.org' ||
        host === 'rust-lang.org' ||
        host === 'go.dev'
      ) {
        return 'documentation';
      }

      return 'article';
    } catch {
      return 'article';
    }
  }

  private normalizeCandidate(
    item: { title: string; url: string; snippet: string },
    type: ResourceType,
    sourceProvider: string
  ): ResourceCandidate {
    const platform = this.detectPlatformName(item.url);
    const duration = this.extractDuration(item.snippet);

    return {
      type,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      platform,
      duration,
      sourceProvider,
    };
  }

  private detectPlatformName(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
      if (host.includes('developer.mozilla.org')) return 'MDN Web Docs';
      if (host.includes('github.com')) return 'GitHub';
      if (host.includes('freecodecamp.org')) return 'freeCodeCamp';
      if (host.includes('medium.com')) return 'Medium';
      if (host.includes('dev.to')) return 'DEV Community';
      if (host.includes('stackoverflow.com')) return 'Stack Overflow';
      return host;
    } catch {
      return 'Web';
    }
  }

  private extractDuration(snippet: string): string | undefined {
    // Look for (12:34) or • 12:34
    const match = snippet.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    return match ? match[1] : undefined;
  }

  private deduplicateCandidates(candidates: ResourceCandidate[]): ResourceCandidate[] {
    const seen = new Set<string>();
    const result: ResourceCandidate[] = [];

    for (const c of candidates) {
      try {
        const parsed = new URL(c.url);
        // Normalize YouTube URLs to standard video id
        let key = parsed.origin + parsed.pathname;
        if (parsed.searchParams.has('v')) {
          key += `?v=${parsed.searchParams.get('v')}`;
        }
        if (!seen.has(key)) {
          seen.add(key);
          result.push(c);
        }
      } catch {
        if (!seen.has(c.url)) {
          seen.add(c.url);
          result.push(c);
        }
      }
    }

    return result;
  }
}
