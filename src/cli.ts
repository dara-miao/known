#!/usr/bin/env node

// Load .env automatically if present
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] ??= match[2].trim();
  }
}

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readdirSync, statSync, writeFileSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import { parseLinkedInCsv } from "./parse.js";
import { syncToClay } from "./clay.js";
import { loadConfig, saveConfig } from "./config.js";
import { scrapeConnections } from "./scraper.js";
import { scrapeViaAppleScript } from "./scraper-applescript.js";
import { dedupClayTable } from "./dedup-clay.js";

const program = new Command();

program
  .name("linkedin-clay-sync")
  .description("Sync LinkedIn connections to Clay — no LinkedIn API required")
  .version("1.0.0");

// ── sync command ───────────────────────────────────────────────────────────────

program
  .command("sync")
  .description("Import LinkedIn connections CSV → Clay webhook")
  .argument(
    "[csv]",
    "Path to Connections.csv (auto-detects from Downloads if omitted)",
  )
  .option(
    "-w, --webhook <url>",
    "Clay webhook URL (or set CLAY_WEBHOOK_URL env var)",
  )
  .option("--all", "Re-sync all connections, not just new ones")
  .option("--dry-run", "Parse and count without sending to Clay")
  .action(async (csvArg, opts) => {
    const config = loadConfig();

    // Resolve CSV path
    let csvPath: string;
    if (csvArg) {
      csvPath = resolve(csvArg);
    } else {
      csvPath = findLatestLinkedInCsv();
    }

    if (!existsSync(csvPath)) {
      console.error(chalk.red(`CSV not found: ${csvPath}`));
      console.error(
        chalk.dim(
          "Export from: linkedin.com → Settings → Data Privacy → Get a copy of your data → Connections",
        ),
      );
      process.exit(1);
    }

    const webhookUrl =
      opts.webhook ?? config.clayWebhookUrl ?? process.env.CLAY_WEBHOOK_URL;
    if (!webhookUrl && !opts.dryRun) {
      console.error(chalk.red("No Clay webhook URL provided."));
      console.error(chalk.dim("Pass --webhook <url> or set CLAY_WEBHOOK_URL"));
      process.exit(1);
    }

    const spinner = ora("Parsing connections CSV...").start();
    let connections;
    try {
      connections = await parseLinkedInCsv(csvPath);
      spinner.succeed(`Parsed ${chalk.bold(connections.length)} connections`);
    } catch (err) {
      spinner.fail("Failed to parse CSV");
      console.error(err);
      process.exit(1);
    }

    if (opts.dryRun) {
      console.log(chalk.yellow("Dry run — not sending to Clay"));
      const newCount = connections.filter(
        (c) => !config.syncedIds.includes(c.submissionId),
      ).length;
      console.log(`  ${newCount} new connections would be sent`);
      console.log(`  ${connections.length - newCount} already synced`);
      return;
    }

    const alreadySynced = opts.all
      ? new Set<string>()
      : new Set(config.syncedIds);

    const toSync = connections.filter(
      (c) => !alreadySynced.has(c.submissionId),
    );
    if (toSync.length === 0) {
      console.log(
        chalk.green("✓ All connections already synced — nothing new to send"),
      );
      return;
    }

    console.log(
      chalk.cyan(`\nSending ${toSync.length} new connections to Clay...\n`),
    );

    let i = 0;
    const result = await syncToClay(
      toSync,
      webhookUrl,
      alreadySynced,
      (name, status) => {
        i++;
        const icon =
          status === "sent"
            ? chalk.green("✓")
            : status === "skipped"
              ? chalk.dim("–")
              : chalk.red("✗");
        process.stdout.write(
          `\r${icon} [${i}/${toSync.length}] ${name.padEnd(40)}`,
        );
      },
    );

    process.stdout.write("\n\n");
    console.log(chalk.green(`✓ Sent: ${result.sent}`));
    if (result.failed.length > 0) {
      console.log(chalk.red(`✗ Failed: ${result.failed.length}`));
    }

    // Save state
    config.syncedIds = [...alreadySynced];
    config.lastSyncedAt = new Date().toISOString();
    if (webhookUrl) config.clayWebhookUrl = webhookUrl;
    saveConfig(config);

    console.log(
      chalk.dim(`\nState saved → ${homedir()}/.linkedin-clay-sync.json`),
    );
  });

// ── scrape command ─────────────────────────────────────────────────────────────

program
  .command("scrape")
  .description(
    "Scrape LinkedIn connections directly — uses your existing Chrome on macOS, Playwright elsewhere",
  )
  .option(
    "-w, --webhook <url>",
    "Clay webhook URL (or set CLAY_WEBHOOK_URL env var)",
  )
  .option(
    "--playwright",
    "Force Playwright browser instead of existing Chrome (non-macOS default)",
  )
  .option("--dry-run", "Scrape without sending to Clay")
  .action(async (opts) => {
    const config = loadConfig();
    const webhookUrl =
      opts.webhook ?? config.clayWebhookUrl ?? process.env.CLAY_WEBHOOK_URL;

    if (!webhookUrl && !opts.dryRun) {
      console.error(chalk.red("No Clay webhook URL."));
      console.error(
        chalk.dim(
          "Pass --webhook <url>, set CLAY_WEBHOOK_URL env var, or add it to .env",
        ),
      );
      process.exit(1);
    }

    const alreadySynced = new Set(config.syncedIds);
    let connections: Awaited<ReturnType<typeof scrapeConnections>>;

    const useMac = platform() === "darwin" && !opts.playwright;

    if (useMac) {
      console.log(
        chalk.cyan("\nConnecting to your existing Chrome session..."),
      );
      console.log(
        chalk.dim(
          "Make sure linkedin.com/mynetwork/invite-connect/connections/ is open in Chrome.\n",
        ),
      );
      connections = await scrapeViaAppleScript({
        onProgress: (scraped, _pushed, name) => {
          process.stdout.write(
            `\r${chalk.dim("Scraping...")} ${chalk.bold(scraped)} — ${name.padEnd(40)}`,
          );
        },
      });
    } else {
      console.log(chalk.cyan("\nOpening LinkedIn in browser..."));
      console.log(
        chalk.dim("Sign in if prompted — session is saved for future runs.\n"),
      );
      connections = await scrapeConnections({
        onProgress: (count, name) => {
          process.stdout.write(
            `\r${chalk.dim("Scraping...")} ${chalk.bold(count)} — ${name.padEnd(40)}`,
          );
        },
      });
    }

    process.stdout.write("\n");
    console.log(chalk.green(`\n✓ Scraped ${connections.length} connections`));

    if (opts.dryRun) {
      const newCount = connections.filter(
        (c) => !alreadySynced.has(c.submissionId),
      ).length;
      console.log(
        chalk.yellow(
          `Dry run — ${newCount} new connections would be sent to Clay`,
        ),
      );
      return;
    }

    const toSync = connections.filter(
      (c) => !alreadySynced.has(c.submissionId),
    );
    console.log(
      chalk.cyan(`Sending ${toSync.length} new connections to Clay...\n`),
    );

    let i = 0;
    const result = await syncToClay(
      toSync,
      webhookUrl!,
      alreadySynced,
      (name, status) => {
        i++;
        const icon = status === "sent" ? chalk.green("✓") : chalk.red("✗");
        process.stdout.write(
          `\r${icon} [${i}/${toSync.length}] ${name.padEnd(40)}`,
        );
      },
    );

    process.stdout.write("\n\n");
    console.log(chalk.green(`✓ Sent: ${result.sent}`));
    if (result.failed.length > 0)
      console.log(chalk.red(`✗ Failed: ${result.failed.length}`));

    config.syncedIds = [...alreadySynced];
    config.lastSyncedAt = new Date().toISOString();
    if (webhookUrl) config.clayWebhookUrl = webhookUrl;
    saveConfig(config);

    console.log(
      chalk.dim(
        `\nState saved — ${toSync.length - result.failed.length} new connections in Clay`,
      ),
    );
  });

// ── dedup command ──────────────────────────────────────────────────────────────

program
  .command("dedup")
  .description(
    "Remove duplicate rows from your Clay LinkedIn Connections table (macOS — requires Clay open in Chrome)",
  )
  .option(
    "--table-name <name>",
    "Clay table name to dedup (default: auto-detect LinkedIn table)",
    "linkedin",
  )
  .option(
    "--workspace-id <id>",
    "Clay workspace ID (default: 227550)",
    "227550",
  )
  .option("--dry-run", "Show how many duplicates exist without deleting them")
  .action(async (opts) => {
    if (platform() !== "darwin") {
      console.error(
        chalk.red(
          "dedup requires macOS (uses AppleScript to interact with Clay in Chrome).",
        ),
      );
      process.exit(1);
    }

    console.log(chalk.cyan("\nConnecting to Clay in Chrome...\n"));
    console.log(
      chalk.dim("Make sure you are logged in to Clay at app.clay.com\n"),
    );

    try {
      const result = await dedupClayTable({
        workspaceId: parseInt(opts.workspaceId),
        tableNameHint: opts.tableName,
        onProgress: (msg) => console.log(chalk.dim(msg)),
      });

      if (opts.dryRun) {
        console.log(
          chalk.yellow(
            `\nDry run — found ${result.duplicatesRemoved} duplicate rows that would be removed`,
          ),
        );
        console.log(
          chalk.dim(
            `Table: ${result.tableId}, Total rows: ${result.totalRows}`,
          ),
        );
        return;
      }

      if (result.duplicatesRemoved === 0) {
        console.log(
          chalk.green("\n✓ No duplicates found — Clay table is clean"),
        );
      } else {
        console.log(
          chalk.green(`\n✓ Removed ${result.duplicatesRemoved} duplicate rows`),
        );
      }

      console.log(chalk.dim(`  Table: ${result.tableId}`));
      console.log(
        chalk.dim(
          `  Remaining rows: ${result.totalRows - result.duplicatesRemoved}`,
        ),
      );

      if (result.errors.length > 0) {
        console.log(chalk.red(`\n✗ ${result.errors.length} errors:`));
        result.errors.forEach((e) => console.log(chalk.dim(`  ${e}`)));
      }
    } catch (err: unknown) {
      console.error(chalk.red("\n✗ Dedup failed:"));
      console.error((err as Error).message ?? err);
      process.exit(1);
    }
  });

// ── install-cron command ───────────────────────────────────────────────────────

program
  .command("install-cron")
  .description(
    "Install a daily LaunchAgent (macOS) to auto-sync new connections",
  )
  .option("-w, --webhook <url>", "Clay webhook URL")
  .option("--hour <h>", "Hour to run (0-23, default 8)", "8")
  .action(async (opts) => {
    if (platform() !== "darwin") {
      console.error(
        chalk.red("install-cron only supports macOS (LaunchAgent)"),
      );
      process.exit(1);
    }

    const config = loadConfig();
    const webhookUrl =
      opts.webhook ?? config.clayWebhookUrl ?? process.env.CLAY_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error(chalk.red("No webhook URL — pass --webhook <url>"));
      process.exit(1);
    }

    config.clayWebhookUrl = webhookUrl;
    saveConfig(config);

    const scriptPath = resolve(import.meta.dirname, "../scripts/daily-sync.sh");
    const plistPath = join(
      homedir(),
      "Library/LaunchAgents/com.calebnewton.linkedin-clay-sync.plist",
    );

    const scriptContent = `#!/bin/bash
# Auto-generated by linkedin-clay-sync
# Finds the latest LinkedIn Connections.csv and syncs new connections to Clay

DOWNLOADS="$HOME/Downloads"
CSV=$(find "$DOWNLOADS" -name "Connections.csv" -not -path "*/\\.*" 2>/dev/null | sort -t_ -k1,1 | tail -1)

if [ -z "$CSV" ]; then
  echo "$(date): No Connections.csv found in Downloads" >> /tmp/linkedin-clay-sync.log
  exit 0
fi

echo "$(date): Syncing from $CSV" >> /tmp/linkedin-clay-sync.log
node "$(dirname "$0")/../src/cli.ts" sync "$CSV" --webhook "${webhookUrl}" >> /tmp/linkedin-clay-sync.log 2>&1
`;

    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.calebnewton.linkedin-clay-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>npx</string>
    <string>tsx</string>
    <string>${resolve(process.cwd(), "src/cli.ts")}</string>
    <string>sync</string>
    <string>--webhook</string>
    <string>${webhookUrl}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${opts.hour}</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/linkedin-clay-sync.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/linkedin-clay-sync-error.log</string>
  <key>WorkingDirectory</key>
  <string>${resolve(process.cwd())}</string>
</dict>
</plist>`;

    writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
    writeFileSync(plistPath, plistContent);

    console.log(chalk.green("✓ LaunchAgent installed"));
    console.log(chalk.dim(`  Plist: ${plistPath}`));
    console.log(chalk.dim(`  Runs daily at ${opts.hour}:00`));
    console.log(chalk.dim(`  Logs: /tmp/linkedin-clay-sync.log`));
    console.log("");
    console.log(chalk.cyan("To activate:"));
    console.log(`  launchctl load ${plistPath}`);
    console.log("");
    console.log(chalk.dim("Each morning it will check Downloads for a fresh"));
    console.log(
      chalk.dim("Connections.csv and push only new connections to Clay."),
    );
  });

// ── auto-detect CSV ────────────────────────────────────────────────────────────

function findLatestLinkedInCsv(): string {
  const downloads = join(homedir(), "Downloads");
  let best = { path: "", mtime: 0 };

  function walk(dir: string) {
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".")) continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (entry === "Connections.csv" && stat.mtimeMs > best.mtime) {
          best = { path: full, mtime: stat.mtimeMs };
        }
      }
    } catch {}
  }

  walk(downloads);
  return best.path || join(downloads, "Connections.csv");
}

program.parse();
