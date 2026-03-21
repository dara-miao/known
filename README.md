# linkedin-clay-sync

Sync your LinkedIn connections into [Clay](https://clay.com) automatically — no LinkedIn API, no manual exports, no new browser windows.

**macOS**: reads directly from your already-open Chrome tab. One command, done.
**Other platforms**: opens a browser, you log in once, session is saved forever.

---

## Quickstart (macOS)

**1.** Open your LinkedIn connections page in Chrome:

```
https://www.linkedin.com/mynetwork/invite-connect/connections/
```

**2.** Enable JavaScript from Apple Events in Chrome:

> Chrome menu bar → View → Developer → Allow JavaScript from Apple Events

**3.** Clone and run:

```bash
git clone https://github.com/calebnewtonusc/linkedin-clay-sync
cd linkedin-clay-sync
npm install
cp .env.example .env
# Add your Clay webhook URL to .env
npm run scrape
```

That's it. All your connections are in Clay.

---

## Setup

### Get your Clay webhook URL

1. Go to your Clay table
2. Click **Sources** → **+ Add Source** → **Webhook**
3. Copy the URL

### Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
CLAY_WEBHOOK_URL=https://api.clay.com/v3/sources/webhook/your-token-here
```

---

## Commands

### `npm run scrape` (recommended)

Scrapes LinkedIn directly from your open Chrome tab (macOS) or via Playwright browser (other platforms). Only sends connections not previously synced — safe to re-run anytime.

```bash
npm run scrape
npm run scrape -- --dry-run       # count without sending
npm run scrape -- --playwright    # force Playwright browser on macOS
```

### `npm run sync` (CSV fallback)

If you have a LinkedIn data export CSV:

```bash
npm run sync ~/Downloads/Connections.csv
npm run sync -- --all             # re-sync everything
```

### `npm run install-cron`

Install a macOS LaunchAgent that scrapes and syncs every morning at 8am automatically — new connections appear in Clay overnight.

```bash
npm run install-cron
launchctl load ~/Library/LaunchAgents/com.calebnewton.linkedin-clay-sync.plist
```

---

## What gets sent to Clay

```json
{
  "submission_id": "li_calebnewton",
  "name": "Caleb Newton",
  "first_name": "Caleb",
  "last_name": "Newton",
  "linkedin_url": "https://www.linkedin.com/in/calebnewton-/",
  "position": "Founder",
  "company": "Blue Modern Advisory",
  "connected_on": "2026-03-21",
  "source": "linkedin_applescript",
  "synced_at": "2026-03-21T08:00:00.000Z"
}
```

`submission_id` is the deduplication key — re-running never creates duplicates.

---

## Clay enrichment setup

Once connections are in Clay, add these columns:

| Column         | Tool                | Maps on                       |
| -------------- | ------------------- | ----------------------------- |
| Email          | Apollo / Hunter     | `linkedin_url`                |
| Company info   | Clearbit            | `company`                     |
| Current role   | LinkedIn enrichment | `linkedin_url`                |
| Outreach draft | AI (Claude/GPT)     | `name`, `position`, `company` |

---

## How it works

LinkedIn has no public connections API. This tool:

1. **macOS**: Uses AppleScript to run JavaScript inside your already-open Chrome tab — reads the connections page DOM directly, no new browser or login needed
2. **Other platforms**: Playwright opens a browser with a persistent session (you log in once, it saves cookies for all future runs)
3. Deduplicates by LinkedIn profile slug so only new connections are ever sent
4. POSTs each connection to your Clay webhook — appears as a new row instantly

---

## License

MIT — build on it, fork it, use it for anything.
