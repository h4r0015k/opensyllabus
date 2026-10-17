import { describe, it, expect, vi } from 'vitest';
import {
  YouTubeSearchProvider,
  QueryGenerator,
  Searcher,
  type ResearchResult,
  type SearchProvider,
} from '../src/index.js';

describe('YouTubeSearchProvider', () => {
  it('parses ytInitialData JSON structure correctly', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <script>
            var ytInitialData = {
              "contents": {
                "twoColumnSearchResultsRenderer": {
                  "primaryContents": {
                    "sectionListRenderer": {
                      "contents": [
                        {
                          "itemSectionRenderer": {
                            "contents": [
                              {
                                "videoRenderer": {
                                  "videoId": "abc12345678",
                                  "title": { "runs": [{ "text": "Python Full Course for Beginners" }] },
                                  "ownerText": { "runs": [{ "text": "Programming with Mosh" }] },
                                  "lengthText": { "simpleText": "6:14:07" },
                                  "detailedMetadataSnippets": [
                                    { "snippetText": { "runs": [{ "text": "Learn Python in this complete course." }] } }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                }
              }
            };
          </script>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    }));

    const provider = new YouTubeSearchProvider();
    const results = await provider.search('python beginner tutorial');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Python Full Course for Beginners');
    expect(results[0].url).toBe('https://www.youtube.com/watch?v=abc12345678');
    expect(results[0].snippet).toContain('Programming with Mosh');
    expect(results[0].snippet).toContain('6:14:07');

    vi.unstubAllGlobals();
  });

  it('falls back to regex parser if ytInitialData is partial', async () => {
    const mockHtml = `
      <div>Random markup</div>
      {"videoId":"xyz98765432","title":{"runs":[{"text":"FastAPI Crash Course"}]}}
    `;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    }));

    const provider = new YouTubeSearchProvider();
    const results = await provider.search('fastapi crash course');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('FastAPI Crash Course');
    expect(results[0].url).toBe('https://www.youtube.com/watch?v=xyz98765432');

    vi.unstubAllGlobals();
  });
});

describe('QueryGenerator', () => {
  it('generates contextual video and reading queries without duplicate keywords', () => {
    const generator = new QueryGenerator();
    const queries = generator.generate({
      courseTitle: 'Complete Python Bootcamp: Go from Zero to Hero in Python',
      moduleTitle: 'Module 1: Getting Started',
      lessonTitle: 'Lesson 3: Variables and Data Types',
      keyTopics: ['Python', 'Variables'],
    });

    expect(queries.videoQuery).toContain('Variables and Data Types');
    expect(queries.videoQuery).toContain('Python');
    expect(queries.videoQuery).toContain('tutorial');

    expect(queries.readingQuery).toContain('Variables and Data Types');
    expect(queries.readingQuery).toContain('documentation guide');
  });

  it('strips redundant lesson prefixes cleanly', () => {
    const generator = new QueryGenerator();
    const queries = generator.generate({
      courseTitle: 'Docker & Kubernetes Masterclass',
      moduleTitle: 'Section 2',
      lessonTitle: 'Lecture 12: Building Multi-Stage Dockerfiles',
    });

    expect(queries.videoQuery).not.toContain('Lecture 12');
    expect(queries.videoQuery).toContain('Building Multi-Stage Dockerfiles');
    expect(queries.videoQuery).toContain('Docker');
  });
});

describe('Searcher Pipeline Component', () => {
  const sampleCourse: ResearchResult = {
    sourceUrl: 'https://www.udemy.com/course/docker-masterclass/',
    title: 'Docker and Kubernetes: The Complete Guide',
    platform: 'Udemy',
    description: 'Master Docker, Kubernetes, and container architectures.',
    difficulty: 'Intermediate',
    prerequisites: ['Basic Linux'],
    targetAudience: ['Developers', 'DevOps'],
    keyTopics: ['Docker', 'Containers', 'Kubernetes'],
    modules: [
      {
        order: 1,
        title: 'Module 1: Docker Basics',
        lessons: [
          { order: 1, title: 'What is a Container?', learningPoints: [] },
          { order: 2, title: 'The Dockerfile Architecture', learningPoints: [] },
        ],
      },
    ],
    metadata: {
      scrapedSuccessfully: true,
      searchAugmented: false,
      timestamp: new Date().toISOString(),
    },
  };

  it('dispatches queries, extracts types, and deduplicates candidate pools', async () => {
    const mockVideoProvider: SearchProvider = {
      name: 'mock-youtube',
      search: async (query) => [
        {
          title: `Video: ${query}`,
          url: 'https://www.youtube.com/watch?v=dockervideo1',
          snippet: '[Traversy Media] In-depth tutorial • 22:15',
        },
      ],
    };

    const mockReadingProvider: SearchProvider = {
      name: 'mock-reading',
      search: async (query) => [
        {
          title: `Docs: ${query}`,
          url: 'https://docs.docker.com/get-started/',
          snippet: 'Official Docker documentation and reference guide.',
        },
        {
          title: `GitHub Repo: ${query}`,
          url: 'https://github.com/docker/awesome-compose',
          snippet: 'Awesome Docker Compose samples.',
        },
      ],
    };

    const searcher = new Searcher({
      videoProvider: mockVideoProvider,
      readingProvider: mockReadingProvider,
      concurrency: 1,
    });

    const result = await searcher.searchCandidates(sampleCourse);

    expect(result.courseTitle).toBe('Docker and Kubernetes: The Complete Guide');
    expect(result.totalLessons).toBe(2);
    expect(result.lessons).toHaveLength(2);

    const firstLessonPool = result.lessons[0];
    expect(firstLessonPool.lessonTitle).toBe('What is a Container?');
    expect(firstLessonPool.candidates.length).toBeGreaterThanOrEqual(3);

    // Verify type detection
    const videoCand = firstLessonPool.candidates.find((c) => c.type === 'video');
    expect(videoCand).toBeDefined();
    expect(videoCand?.platform).toBe('YouTube');
    expect(videoCand?.duration).toBe('22:15');

    const docCand = firstLessonPool.candidates.find((c) => c.type === 'documentation');
    expect(docCand).toBeDefined();
    expect(docCand?.platform).toContain('docs.docker.com');

    const ghCand = firstLessonPool.candidates.find((c) => c.type === 'github');
    expect(ghCand).toBeDefined();
    expect(ghCand?.platform).toBe('GitHub');

    expect(result.stats.totalQueriesExecuted).toBe(4); // 2 lessons * 2 queries
    expect(result.stats.totalCandidatesFound).toBeGreaterThanOrEqual(6);
  });
});
