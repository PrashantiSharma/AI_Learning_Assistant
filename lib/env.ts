import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function readDatabaseUrl(filePath: string): string | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^DATABASE_URL\s*=\s*(.+)\s*$/);
    if (!match) {
      continue;
    }

    let value = match[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    return value;
  }

  return undefined;
}

const cwd = process.cwd();
const dbUrlFromFile =
  readDatabaseUrl(path.join(cwd, ".env.local")) ??
  readDatabaseUrl(path.join(cwd, ".env"));

if (dbUrlFromFile) {
  // Force current process to use on-disk config, avoiding stale env values
  // in long-running dev servers after credential changes.
  process.env.DATABASE_URL = dbUrlFromFile;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Set it in .env or .env.local.");
}
