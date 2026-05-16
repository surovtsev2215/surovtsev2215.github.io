/**
 * Lists reports containing base64 photos (run on server with DATABASE_URL).
 * Usage: node scripts/migrate-base64-photos.js
 */
import * as store from "../src/db/store.js";
import { findBase64PhotoInReport } from "../src/reportPhotos.js";

await store.initStore();

const reports = await store.listReports({ limit: 5000 });
let hits = 0;

for (const report of reports) {
  const where = findBase64PhotoInReport(report);
  if (where) {
    hits += 1;
    console.log(`[base64] ${report.id} ${report.date} user=${report.userId} — ${where}`);
  }
}

console.log(`Done. Reports with base64 photos: ${hits} / ${reports.length}`);
await store.shutdownStore();
