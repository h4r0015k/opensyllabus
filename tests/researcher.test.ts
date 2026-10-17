import { describe, it, expect, vi } from 'vitest';
import {
  Researcher,
  BraveSearchProvider,
  DuckDuckGoSearchProvider,
  FetchScraperProvider,
  type ScraperProvider,
  type SearchProvider,
  type ScrapedPage,
} from '../src/index.js';

describe('Search Providers', () => {
  it('BraveSearchProvider throws if apiKey is missing', () => {
    expect(() => new BraveSearchProvider({ apiKey: '' })).toThrow('requires a valid apiKey');
  });

  it('BraveSearchProvider formats headers and parses results correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: 'Learn Python in 2026',
              url: 'https://example.com/python',
              description: 'A complete free Python guide.',
            },
          ],
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    const provider = new BraveSearchProvider({ apiKey: 'test-token-123' });
    const results = await provider.search('python curriculum', { limit: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Learn Python in 2026');
    expect(results[0].url).toBe('https://example.com/python');
    expect(results[0].snippet).toBe('A complete free Python guide.');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('q=python+curriculum'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Subscription-Token': 'test-token-123',
        }),
      })
    );

    vi.unstubAllGlobals();
  });

  it('DuckDuckGoSearchProvider parses HTML search results and decodes redirects', async () => {
    const mockHtml = `
      <div class="result results_links">
        <h2 class="result__title">
          <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcoursera.org%2Flearn%2Fpython&rut=...">Python for Everybody</a>
        </h2>
        <a class="result__snippet">Learn Python basics, data structures, and APIs.</a>
      </div>
    `;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => mockHtml,
    }));

    const provider = new DuckDuckGoSearchProvider();
    const results = await provider.search('python course coursera');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Python for Everybody');
    expect(results[0].url).toBe('https://coursera.org/learn/python');
    expect(results[0].snippet).toContain('Learn Python basics');

    vi.unstubAllGlobals();
  });
});

describe('Scraper Provider', () => {
  it('FetchScraperProvider extracts OpenGraph, JSON-LD, headings, and clean content', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mastering TypeScript - Pro Course</title>
          <meta property="og:title" content="Mastering TypeScript" />
          <meta property="og:description" content="In-depth TypeScript course." />
          <meta property="og:site_name" content="CoursePlatform" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Course",
              "name": "Mastering TypeScript",
              "educationalLevel": "Intermediate",
              "timeRequired": "12 hours",
              "author": { "@type": "Person", "name": "Jane Doe" }
            }
          </script>
        </head>
        <body>
          <header><nav>Home | Login</nav></header>
          <main>
            <h1>Mastering TypeScript</h1>
            <h2>Module 1: Type Fundamentals</h2>
            <h3>Lesson 1.1: Primitives and Unions</h3>
            <h3>Lesson 1.2: Generics and Constraints</h3>
            <h2>Module 2: Advanced Patterns</h2>
            <h3>Lesson 2.1: Conditional Types</h3>
          </main>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => mockHtml,
    }));

    const scraper = new FetchScraperProvider();
    const scraped = await scraper.scrape('https://example.com/course/typescript');

    expect(scraped.title).toBe('Mastering TypeScript');
    expect(scraped.description).toBe('In-depth TypeScript course.');
    expect(scraped.jsonLd).toHaveLength(1);
    expect(scraped.headings.length).toBeGreaterThanOrEqual(4);
    expect(scraped.isBlockedOrProtected).toBe(false);

    vi.unstubAllGlobals();
  });
});

describe('Researcher Component', () => {
  it('detects platform correctly from URL', () => {
    const researcher = new Researcher();
    // test platform detection via research
    expect((researcher as any).detectPlatform('https://www.udemy.com/course/complete-python/')).toBe('Udemy');
    expect((researcher as any).detectPlatform('https://www.coursera.org/specializations/deep-learning')).toBe('Coursera');
    expect((researcher as any).detectPlatform('https://maven.com/p/ai-agents')).toBe('Maven');
    expect((researcher as any).detectPlatform('https://randomblog.dev/guide')).toBe('Generic Web');
  });

  it('extracts structured research result from scraped page', async () => {
    const mockScraper: ScraperProvider = {
      name: 'mock',
      scrape: async (url) => ({
        url,
        status: 200,
        title: 'Fullstack Web Development Bootcamp',
        description: 'Learn modern fullstack development from scratch.',
        content: 'Fullstack course covering HTML, CSS, JavaScript, React, Node.js.',
        headings: [
          { level: 1, text: 'Fullstack Web Development Bootcamp' },
          { level: 2, text: 'Section 1: Frontend Fundamentals' },
          { level: 3, text: 'HTML5 Semantic Layouts' },
          { level: 3, text: 'CSS Grid & Flexbox Masterclass' },
          { level: 2, text: 'Section 2: Backend with Node.js' },
          { level: 3, text: 'Building REST APIs with Express' },
        ],
        jsonLd: [
          {
            '@type': 'Course',
            educationalLevel: 'Beginner',
            author: { '@type': 'Person', name: 'John Smith' },
          },
        ],
        openGraph: {},
        isBlockedOrProtected: false,
      }),
    };

    const researcher = new Researcher({ scraper: mockScraper });
    const result = await researcher.research('https://www.udemy.com/course/fullstack-bootcamp/');

    expect(result.platform).toBe('Udemy');
    expect(result.title).toBe('Fullstack Web Development Bootcamp');
    expect(result.instructor).toBe('John Smith');
    expect(result.difficulty).toBe('Beginner');
    expect(result.modules).toHaveLength(2);
    expect(result.modules[0].title).toBe('Section 1: Frontend Fundamentals');
    expect(result.modules[0].lessons).toHaveLength(2);
    expect(result.modules[0].lessons[0].title).toBe('HTML5 Semantic Layouts');
    expect(result.keyTopics).toContain('HTML5 Semantic Layouts');
    expect(result.metadata.scrapedSuccessfully).toBe(true);
  });

  it('falls back to search provider when direct scraping is blocked or fails', async () => {
    const mockBlockedScraper: ScraperProvider = {
      name: 'mock-blocked',
      scrape: async (url) => ({
        url,
        status: 403,
        title: 'Just a moment... Cloudflare',
        description: '',
        content: 'Please verify you are human.',
        headings: [],
        jsonLd: [],
        openGraph: {},
        isBlockedOrProtected: true,
      }),
    };

    const mockSearchProvider: SearchProvider = {
      name: 'mock-search',
      search: async () => [
        {
          title: 'System Design Interview Syllabus & Modules',
          url: 'https://example.com/syllabus',
          snippet: 'Module 1: Scalability, Load Balancing, Caching. Module 2: Database Sharding & Replication.',
        },
      ],
    };

    const researcher = new Researcher({
      scraper: mockBlockedScraper,
      searchProvider: mockSearchProvider,
    });

    const result = await researcher.research('https://www.coursera.org/learn/system-design');

    expect(result.platform).toBe('Coursera');
    expect(result.metadata.scrapedSuccessfully).toBe(false);
    expect(result.metadata.searchAugmented).toBe(true);
    expect(result.metadata.searchProviderUsed).toBe('mock-search');
    expect(result.modules.length).toBeGreaterThan(0);
  });
});
