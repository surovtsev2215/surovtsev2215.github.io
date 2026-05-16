import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const DB_WRITE_DEBOUNCE_MS = 40;

let dbCache = null;
let pendingWriteTimer = null;
let latestSerializedDb = "";

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { users: [], reports: [], tasks: [], settings: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

function flushDbNow() {
  if (!latestSerializedDb) return;
  ensureDb();
  fs.writeFileSync(DATA_FILE, latestSerializedDb, "utf8");
}

function readDb() {
  if (dbCache) return dbCache;
  ensureDb();
  const db = parseJsonSafe(fs.readFileSync(DATA_FILE, "utf8"), { users: [], reports: [], tasks: [], settings: {} });
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.reports)) db.reports = [];
  if (!Array.isArray(db.tasks)) db.tasks = [];
  if (!db.settings || typeof db.settings !== "object") db.settings = {};
  dbCache = db;
  return db;
}

function writeDb(db) {
  dbCache = db;
  latestSerializedDb = JSON.stringify(db, null, 2);
  if (pendingWriteTimer) return;
  pendingWriteTimer = setTimeout(() => {
    pendingWriteTimer = null;
    flushDbNow();
  }, DB_WRITE_DEBOUNCE_MS);
}

export async function initJsonStore() {
  readDb();
}

export function shutdownJsonStore() {
  flushDbNow();
}

export async function jsonCountUsers() {
  return readDb().users.length;
}

export async function jsonFindUserByNormalized(norm) {
  return readDb().users.find((u) => u.fullNameNormalized === norm) || null;
}

export async function jsonFindUserByUid(uid) {
  return readDb().users.find((u) => u.uid === uid) || null;
}

export async function jsonListUsers() {
  return readDb().users.slice();
}

export async function jsonCreateUser(user) {
  const db = readDb();
  db.users.push(user);
  writeDb(db);
  return user;
}

export async function jsonUpdateUser(uid, updater) {
  const db = readDb();
  const user = db.users.find((u) => u.uid === uid);
  if (!user) return null;
  updater(user);
  writeDb(db);
  return user;
}

export async function jsonDeleteUser(uid) {
  const db = readDb();
  const index = db.users.findIndex((u) => u.uid === uid);
  if (index === -1) return false;
  db.users.splice(index, 1);
  writeDb(db);
  return true;
}

function applyReportListFilter(rows, filter = {}) {
  let list = rows.slice();
  if (filter.userId) list = list.filter((r) => r.userId === filter.userId);
  if (filter.from) list = list.filter((r) => String(r.date || "") >= String(filter.from));
  if (filter.to) list = list.filter((r) => String(r.date || "") <= String(filter.to));
  if (filter.status) {
    list = list.filter((r) => (r.status || "submitted") === filter.status);
  }
  if (filter.since) {
    const since = Number(filter.since);
    list = list.filter((r) => Number(r.createdAt || 0) > since);
  }
  list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const offset = Math.max(0, Number(filter.offset) || 0);
  const limit = filter.limit ? Math.min(500, Math.max(1, Number(filter.limit))) : list.length;
  return list.slice(offset, offset + limit);
}

export async function jsonListReports(filter = {}) {
  return applyReportListFilter(readDb().reports, filter);
}

export async function jsonFindReportById(id) {
  return readDb().reports.find((r) => String(r.id) === String(id)) || null;
}

export async function jsonCreateReport(report) {
  const db = readDb();
  db.reports.push(report);
  writeDb(db);
  return report;
}

export async function jsonUpdateReport(report) {
  const db = readDb();
  const index = db.reports.findIndex((r) => String(r.id) === String(report.id));
  if (index === -1) return null;
  db.reports[index] = report;
  writeDb(db);
  return report;
}

export async function jsonDeleteReport(id) {
  const db = readDb();
  const index = db.reports.findIndex((r) => String(r.id) === String(id));
  if (index === -1) return false;
  db.reports.splice(index, 1);
  writeDb(db);
  return true;
}

export async function jsonListTasks() {
  return readDb().tasks.slice();
}

export async function jsonFindTaskById(id) {
  return readDb().tasks.find((t) => t.id === id) || null;
}

export async function jsonCreateTask(task) {
  const db = readDb();
  db.tasks.push(task);
  writeDb(db);
  return task;
}

export async function jsonUpdateTask(task) {
  const db = readDb();
  const index = db.tasks.findIndex((t) => t.id === task.id);
  if (index === -1) return null;
  db.tasks[index] = task;
  writeDb(db);
  return task;
}

export async function jsonDeleteTask(id) {
  const db = readDb();
  const index = db.tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;
  db.tasks.splice(index, 1);
  writeDb(db);
  return true;
}

export async function jsonGetSetting(key) {
  const db = readDb();
  return db.settings?.[key] ?? null;
}

export async function jsonSetSetting(key, value) {
  const db = readDb();
  if (!db.settings || typeof db.settings !== "object") db.settings = {};
  db.settings[key] = value;
  writeDb(db);
  return value;
}

export function getJsonDbPath() {
  return DATA_FILE;
}
