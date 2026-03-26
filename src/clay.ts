import { writeFile } from "fs/promises";
import { resolve } from "path";

interface SyncConnection {
  submissionId: string;
  name: string;
  firstName: string;
  lastName: string;
  linkedinUrl: string;
  email?: string;
  company: string;
  position: string;
  connectedOn: string;
  source: string;
}

export interface SyncResult {
  sent: number;
  skipped: number;
  failed: string[];
}

export async function syncToClay(
  connections: SyncConnection[],
  _webhookUrl: string,
  alreadySynced: Set<string>,
  onProgress?: (name: string, status: "sent" | "skipped" | "failed") => void,
  delayMs = 100
): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, skipped: 0, failed: [] };
  const rows: Record<string, string>[] = [];

  for (const conn of connections) {
    if (alreadySynced.has(conn.submissionId)) {
      result.skipped++;
      onProgress?.(conn.name, "skipped");
      continue;
    }

    const payload = {
      submission_id: conn.submissionId,
      name: conn.name,
      first_name: conn.firstName,
      last_name: conn.lastName,
      linkedin_url: conn.linkedinUrl,
      email: conn.email ?? "",
      company: conn.company,
      position: conn.position,
      connected_on: conn.connectedOn,
      source: conn.source,
      synced_at: new Date().toISOString(),
    };

    rows.push(payload);
    result.sent++;
    alreadySynced.add(conn.submissionId);
    onProgress?.(conn.name, "sent");

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  const headers = [
    "submission_id",
    "name",
    "first_name",
    "last_name",
    "linkedin_url",
    "email",
    "company",
    "position",
    "connected_on",
    "source",
    "synced_at",
  ];

  const escapeCsv = (value: string): string => {
    const escaped = value.replace(/"/g, '""');
    if (/[",\n\r]/.test(escaped)) return `"${escaped}"`;
    return escaped;
  };

  const csvLines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escapeCsv(row[h] ?? "")).join(",")),
  ];
  await writeFile(resolve(process.cwd(), "connections.csv"), csvLines.join("\n"));

  return result;
}
