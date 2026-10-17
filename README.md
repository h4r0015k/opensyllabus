# OpenSyllabus

Turn any paid course link into a structured, free, interactive curriculum.

> 🤖 **Note:** This project is actively being developed with AI-assisted pair-programming.

OpenSyllabus is a local-first, open-source engine that takes a public course sales page (Udemy, Coursera, edX, Maven, etc.), analyzes its curriculum, and synthesizes an equivalent, high-quality free learning path using curated open resources (YouTube lectures, official documentation, GitHub repositories) combined with AI-generated interactive assessments.

---

## Component: The Researcher

The **Researcher** is the first pipeline component of OpenSyllabus. Given any course link, it:
1. **Extracts Metadata & Syllabus:** Pulls the course title, platform, instructor, description, difficulty, estimated duration, and structured modules/lessons.
2. **Handles Anti-Bot & Paywall Barriers:** If a page is protected by Cloudflare, requires login, or yields sparse content, the Researcher automatically falls back to search engine augmentation to retrieve the syllabus and learning objectives from public indexes.
3. **Provider-Agnostic Design:** Search and scraping layers are built on pluggable interfaces (`SearchProvider`, `ScraperProvider`). The core researcher logic and output schemas remain identical regardless of the underlying service.

### Supported Search Providers
* **YouTube** (`YouTubeSearchProvider`): Built-in zero-token video lecture and tutorial search.
* **DuckDuckGo** (`DuckDuckGoSearchProvider`): Zero-token web search fallback.
* **Brave Search** (`BraveSearchProvider`): High-speed, developer-friendly search with 2,000 free queries/month.
* Custom providers can be added simply by implementing the `SearchProvider` interface.

---

## Component: The Searcher

The **Searcher** is the second pipeline component. It takes the structured syllabus produced by the Researcher and discovers candidate learning materials for every individual lesson:
1. **Intelligent Query Generation:** Formulates targeted, domain-aware queries for both video walkthroughs and official documentation while stripping redundant course title noise.
2. **Multi-Source Candidate Gathering:** Dispatches queries across video and reading providers with built-in concurrency control and backoff delays to prevent rate-limiting.
3. **Type Classification & Normalization:** Automatically classifies candidate resources into `video`, `documentation`, `article`, or `github`, extracting metadata such as channel, platform, and duration.
4. **URL Deduplication:** Normalizes URLs and removes duplicates before handing candidate pools to the Curator.

---

## Installation & Setup

```bash
# Clone the repository
git clone https://github.com/h4r0015k/opensyllabus.git
cd opensyllabus

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run unit & integration tests
npm test
```

---

## Architecture Roadmap

- [x] **Component 1: Researcher** (Scraping, syllabus extraction, Brave & DuckDuckGo search fallback)
- [x] **Component 2: Searcher** (Targeted candidate retrieval for each lesson, YouTube zero-token provider)
- [ ] **Component 3: Curator** (Heuristic domain authority + freshness + duration + semantic ranking)
- [ ] **Component 4: LMS Builder** (Interactive player, active recall quizzes, local-first IndexedDB persistence)

---

## License

MIT © [Nikhil Sahani](https://github.com/h4r0015k)
