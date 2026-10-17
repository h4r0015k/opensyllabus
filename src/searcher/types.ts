import type { SearchProvider } from '../providers/search/types.js';

export type ResourceType = 'video' | 'documentation' | 'article' | 'github';

export interface ResourceCandidate {
  type: ResourceType;
  title: string;
  url: string;
  snippet: string;
  platform?: string;        // "YouTube", "MDN", "GitHub", "Official Docs"
  authorOrChannel?: string; // Channel name or domain
  duration?: string;        // e.g. "15:20" for videos
  sourceProvider: string;   // "youtube", "brave", "duckduckgo"
}

export interface LessonCandidatePool {
  moduleOrder: number;
  moduleTitle: string;
  lessonOrder: number;
  lessonTitle: string;
  learningPoints: string[];
  candidates: ResourceCandidate[];
}

export interface SearcherOptions {
  searchProvider?: SearchProvider;
  videoProvider?: SearchProvider;
  readingProvider?: SearchProvider;
  concurrency?: number;
  delayMs?: number;
  maxCandidatesPerLesson?: number;
}

export interface SearcherResult {
  courseTitle: string;
  totalLessons: number;
  lessons: LessonCandidatePool[];
  stats: {
    totalQueriesExecuted: number;
    totalCandidatesFound: number;
    durationMs: number;
  };
}
