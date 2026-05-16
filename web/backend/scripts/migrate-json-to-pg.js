import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initPostgresStore, pgImportSnapshot, shutdownPostgresStore } from "../src/db/postgresStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, "..", "data", "db.json");

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`File not found: ${DATA_FILE}`);
    process.exit(1);
  }

  const snapshot = parseJsonSafe(fs.readFileSync(DATA_FILE, "utf8"), { users: [], reports: [], tasks: [] });
  await initPostgresStore();
  await pgImportSnapshot({
    users: Array.isArray(snapshot.users) ? snapshot.users : [],
    reports: Array.isArray(snapshot.reports) ? snapshot.reports : [],
    tasks: Array.isArray(snapshot.tasks) ? snapshot.tasks : []
  });
  await shutdownPostgresStore();
  console.log(
    `Migrated users=${snapshot.users?.length ?? 0}, reports=${snapshot.reports?.length ?? 0}, tasks=${snapshot.tasks?.length ?? 0}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
