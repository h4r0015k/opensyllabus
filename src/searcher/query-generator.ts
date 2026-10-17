export interface LessonQueryContext {
  courseTitle: string;
  moduleTitle: string;
  lessonTitle: string;
  learningPoints?: string[];
  keyTopics?: string[];
}

export interface GeneratedQueries {
  videoQuery: string;
  readingQuery: string;
}

export class QueryGenerator {
  /**
   * Builds targeted, high-signal search queries for a specific lesson
   * preserving subject context from the parent course.
   */
  generate(context: LessonQueryContext): GeneratedQueries {
    const subjectContext = this.extractSubjectContext(context.courseTitle, context.keyTopics);
    const cleanLesson = this.sanitizeTitle(context.lessonTitle);

    // Build targeted video query
    const videoQuery = this.buildVideoQuery(cleanLesson, subjectContext);

    // Build targeted reading / doc query
    const readingQuery = this.buildReadingQuery(cleanLesson, subjectContext);

    return {
      videoQuery,
      readingQuery,
    };
  }

  private sanitizeTitle(title: string): string {
    return title
      .replace(/^(lesson|lecture|module|section|chapter|part)\s*\d*[:.-]?\s*/i, '')
      .replace(/^\d+[:.-]\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractSubjectContext(courseTitle: string, keyTopics?: string[]): string {
    const stopWords = new Set([
      'the', 'complete', 'bootcamp', 'course', 'masterclass', 'for', 'beginners',
      'from', 'zero', 'to', 'hero', 'guide', '2024', '2025', '2026', 'advanced',
      'ultimate', 'learn', 'practical', 'in-depth', 'a-z', 'full', 'hands-on'
    ]);

    const words = courseTitle
      .split(/[\s:,\-_|]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));

    // Prefer high-signal programming languages or domains (e.g. Python, Docker, Rust, System Design)
    if (words.length > 0) {
      return words.slice(0, 3).join(' ');
    }

    if (keyTopics && keyTopics.length > 0) {
      return keyTopics.slice(0, 2).join(' ');
    }

    return '';
  }

  private buildVideoQuery(cleanLesson: string, subjectContext: string): string {
    // If the lesson already explicitly mentions the subject, avoid repeating
    const lowerLesson = cleanLesson.toLowerCase();
    const lowerSubject = subjectContext.toLowerCase();

    if (subjectContext && !lowerLesson.includes(lowerSubject)) {
      return `${subjectContext} ${cleanLesson} tutorial in-depth`;
    }

    return `${cleanLesson} tutorial in-depth`;
  }

  private buildReadingQuery(cleanLesson: string, subjectContext: string): string {
    const lowerLesson = cleanLesson.toLowerCase();
    const lowerSubject = subjectContext.toLowerCase();

    if (subjectContext && !lowerLesson.includes(lowerSubject)) {
      return `${subjectContext} ${cleanLesson} official documentation guide`;
    }

    return `${cleanLesson} documentation guide`;
  }
}
