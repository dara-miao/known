# Known

Known is a smart personal contact management tool. You add people you know (friends, founders, professionals) with context: how you know them, their skills, what they're working on, and notes/vibe.

Then you search your contacts using natural language and AI that understands synonyms and intent. Example: "designer" can surface people tagged as "UI/UX" or "creative".

The platform is built as a pipeline: LinkedIn -> enrichment (Bricks) -> Known search. The ingestion layer in this repo exports your LinkedIn connections so Bricks can enrich them.

---

## What it is

Known is three things working together:

1. **Ingestion**: pull your LinkedIn connections without a public LinkedIn API
2. **Enrichment**: normalize and enrich each contact (company data, roles, identifiers)
3. **AI search**: natural language search over your enriched contacts (Claude API)

In v2, Known becomes goal-driven: you provide a goal like "find a pre-seed AI startup internship" and Known recommends 2-3 people and drafts outreach.

---

## Quickstart

### 1. Run the LinkedIn scraper (this repo)

This step outputs a CSV you can feed into your Bricks enrichment workflow.

#### macOS (recommended)

1. Open Chrome and navigate to your LinkedIn connections page:
   ```
   https://www.linkedin.com/mynetwork/invite-connect/connections/
   ```
2. Enable JavaScript from Apple Events in Chrome:
   > Chrome menu bar -> View -> Developer -> Allow JavaScript from Apple Events
3. Clone and run:
   ```bash
   npm install
   npm run scrape
   ```
4. After it finishes, look for a file like `linkedin-connections-YYYY-MM-DD.csv` in the project root.

#### Other platforms (Playwright)

1. Run:
   ```bash
   npm run scrape -- --playwright
   ```
2. Sign into LinkedIn once in the opened browser. The session is persisted for future runs.

### 2. Enrich in Bricks

In Bricks, create a workflow that:

1. Reads the latest scraper CSV (or is triggered on a new file)
2. Upserts contacts into your normalized schema using a stable dedup key
3. Enriches company + role fields using your chosen providers

### 3. Search in Known

Once your Bricks data store is populated, Known's UI uses a Claude-backed search service to:

- interpret intent + synonyms in your query
- retrieve relevant contacts from the enriched dataset
- return the top matches (and in v2, goal-driven recommendations + outreach drafts)

---

## Data pipeline setup

Known's pipeline (in progress) is:

**LinkedIn scraper** -> **Bricks enrichment** -> **Known search layer**

### LinkedIn scraper

This repo is the ingestion step. It has two ways to create a CSV feed for enrichment:

1. `npm run scrape`
2. `npm run sync <Connections.csv>` (CSV fallback)

#### `npm run scrape`

Scrapes your LinkedIn connections and writes an export CSV to the project root.

```bash
npm run scrape
npm run scrape -- --dry-run       # scrape + count, do not write CSV
npm run scrape -- --playwright    # force Playwright browser on macOS
```

#### `npm run sync` (CSV fallback)

If you already have a LinkedIn Connections export CSV, you can parse it and generate the canonical import CSV for downstream enrichment:

```bash
npm run sync ~/Downloads/Connections.csv
```

### Bricks enrichment

Bricks is responsible for turning raw connections into a searchable contact model.

Recommended approach:

1. **Dedup key**: use a stable LinkedIn identifier (for example, a profile slug derived from the profile URL)
2. **Upsert**: upsert contacts on each new run so enrichment is incremental
3. **Enrichment fields** (examples): company name + domain, current role/function/seniority signals, structured skills/tags (from role + enrichment), and communication-ready fields (first name, last name, profile URL)

Bricks should output to the same data store/query layer Known will search.

---

## How search works

Known search is designed to be natural-language-first:

1. **Intent parsing**: Claude converts the user query into structured constraints (role/function keywords, company/industry, stage/goal, and other intent signals)
2. **Synonym expansion**: the system maps terms like "designer" to a controlled set of tags (e.g. `UI/UX`, `product design`, `creative`)
3. **Candidate retrieval**: Known queries the enriched dataset for matching contacts
4. **AI re-ranking**: Claude re-ranks candidates based on fit to the query intent (and optionally the contact notes/vibe)
5. **Response formatting**: Known returns the best matches and, in v2, drafts outreach tailored to the goal

---

## Tech stack

- **Frontend**: HTML/CSS/JS
- **AI search**: Claude API (natural language intent + ranking)
- **Ingestion**: Node/TypeScript CLI
  - macOS: AppleScript + existing Chrome session
  - Other platforms: Playwright with persisted session
- **Enrichment + orchestration**: Bricks (self-hosted Clay alternative)
- **Data model**: Bricks tables powering Known's search layer

---

## What's coming next (v2)

v2 focuses on goal-driven contact recommendations:

- You input a goal (example: `find a pre-seed AI startup internship`)
- Known returns the **2-3 most relevant people**
- Known drafts outreach messages in your tone, grounded in each contact's context

Planned improvements around v2:

- feedback loop (mark matches as good/bad to improve ranking)
- saved goals/searches and periodic re-surfacing as your network changes
- richer contact modeling (skills, relationships, and ongoing project context)

---

## License

MIT — build on it, fork it, and use it for anything.
