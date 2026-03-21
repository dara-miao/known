# linkedin-clay-sync

Sync your LinkedIn connections into [Clay](https://clay.com) (or any webhook endpoint) — **no LinkedIn API required**.

LinkedIn doesn't have a public connections API. This tool works around that using your LinkedIn data export, pushing each connection to Clay where it gets auto-enriched with emails, company data, and AI-generated outreach.

---

## What it does

- Parses your LinkedIn `Connections.csv` export
- Pushes each connection to a Clay webhook (or any HTTP endpoint)
- Tracks which connections have already been synced — only sends new ones on subsequent runs
- Optional: installs a daily macOS LaunchAgent so new connections sync automatically every morning

---

## Setup

### 1. Export your LinkedIn connections

1. Go to [linkedin.com](https://linkedin.com) → Settings & Privacy
2. Data Privacy → Get a copy of your data
3. Select **Connections** only → Request archive
4. LinkedIn emails you a download link (usually within minutes)
5. Unzip → find `Connections.csv`

### 2. Get your Clay webhook URL

In your Clay table:
1. Click **Sources** → **+ Add Source** → **Webhook**
2. Copy the webhook URL

### 3. Install and run

```bash
git clone https://github.com/calebnewtonusc/linkedin-clay-sync
cd linkedin-clay-sync
npm install

# Sync your connections
CLAY_WEBHOOK_URL=https://api.clay.com/v3/sources/webhook/YOUR_TOKEN \
  npm run sync ~/Downloads/Connections.csv
```

Or create a `.env` file:

```bash
cp .env.example .env
# Fill in CLAY_WEBHOOK_URL
```

Then just:

```bash
npm run sync
# Auto-detects Connections.csv from ~/Downloads
```

---

## Commands

### `sync [csv]`

Push LinkedIn connections to Clay. Only sends connections not previously synced.

```bash
npm run sync                          # auto-detects CSV from ~/Downloads
npm run sync ~/path/to/Connections.csv
npm run sync -- --all                 # re-sync everything
npm run sync -- --dry-run             # count without sending
npm run sync -- --webhook <url>       # override webhook URL
```

### `install-cron`

Install a macOS LaunchAgent that runs sync every morning at 8am.

```bash
npm run install-cron -- --webhook https://api.clay.com/v3/sources/webhook/YOUR_TOKEN
# Then activate it:
launchctl load ~/Library/LaunchAgents/com.calebnewton.linkedin-clay-sync.plist
```

After this, just re-download your LinkedIn export occasionally and the next morning run will pick up new connections automatically.

---

## Clay enrichment setup

Once connections are in Clay, add these columns to enrich each person:

| Column | Type | Config |
|---|---|---|
| Email | Find email | Map on `linkedin_url` via Apollo or Hunter |
| Company info | Clearbit | Map on `company` |
| Current role | LinkedIn Profile | Map on `linkedin_url` |
| Outreach draft | AI | Prompt: "Write a personalized connection message for {name} at {company}" |

---

## Data fields sent to Clay

```json
{
  "submission_id": "li_calebnewton",
  "name": "Caleb Newton",
  "first_name": "Caleb",
  "last_name": "Newton",
  "linkedin_url": "https://www.linkedin.com/in/calebnewton-/",
  "email": "",
  "company": "Blue Modern Advisory",
  "position": "Founder",
  "connected_on": "21 Mar 2026",
  "source": "linkedin_export",
  "synced_at": "2026-03-21T00:00:00.000Z"
}
```

`submission_id` is used as Clay's deduplication key — safe to re-run without creating duplicates.

---

## Why this exists

Clay's AI agent can't access your LinkedIn connections directly. LinkedIn's API doesn't expose connection data. This tool bridges that gap using LinkedIn's own data export feature — the one thing LinkedIn has to give you under GDPR/CCPA.

---

## License

MIT
