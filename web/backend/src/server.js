import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT || 8787);
const JWT_SECRET = process.env.JWT_SECRET || "local-dev-secret-change-me";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

function normalizeLetters(input) {
  return String(input || "").normalize("NFC").replace(/ё/g, "е").replace(/Ё/g, "Е");
}

function capitalizeWord(value) {
  if (!value) return "";
  return value[0].toLocaleUpperCase("ru-RU") + value.slice(1).toLocaleLowerCase("ru-RU");
}

function splitNameParts(input) {
  return normalizeLetters(input)
    .trim()
    .replace(/[.\s]+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.replace(/[^\p{L}-]/gu, ""))
    .filter(Boolean);
}

const MIN_PASSWORD_LENGTH = 4;

function formatFullNameForDisplay(input) {
  const normalized = normalizeLetters(input).trim();
  if (!normalized) return "";
  const parts = splitNameParts(normalized);

  if (parts.length >= 2) {
    const surname = capitalizeWord(parts[0]);
    const initials = parts
      .slice(1)
      .map((part) => part[0]?.toLocaleUpperCase("ru-RU") || "")
      .join("");
    return `${surname}${initials}`;
  }

  const onePart = parts[0] || normalized.replace(/[^\p{L}-]/gu, "");
  if (!onePart) return "";
  const matched = onePart.match(/^([\p{L}-]+?)([\p{Lu}]{1,4})$/u);
  if (matched) {
    return `${capitalizeWord(matched[1])}${matched[2].toLocaleUpperCase("ru-RU")}`;
  }
  return capitalizeWord(onePart);
}

function normalizeFullName(input) {
  return formatFullNameForDisplay(input)
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\d]/gu, "");
}

function syntheticEmailForUid(uid) {
  const safe = String(uid || "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "user"}@pto.local`;
}

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
    const initial = { users: [], reports: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  const db = parseJsonSafe(fs.readFileSync(DATA_FILE, "utf8"), { users: [], reports: [] });
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.reports)) db.reports = [];
  return db;
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function buildProfile(user) {
  return {
    uid: user.uid,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt
  };
}

function signToken(user) {
  return jwt.sign({ uid: user.uid, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

function authRequired(req, res, next) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "Требуется авторизация." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "Сессия истекла. Войдите снова." });
  }
}

function adminRequired(req, res, next) {
  if (!req.auth || req.auth.role !== "admin") {
    return res.status(403).json({ error: "Только администратор может выполнять это действие." });
  }
  return next();
}

function decodeBearerToken(headerValue) {
  const header = String(headerValue || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: "20mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: "local-backend" });
});

app.post("/api/auth/register", async (req, res) => {
  const fullNameRaw = String(req.body?.fullName || "");
  const password = String(req.body?.password || "");
  const requestedRole = req.body?.requestedRole;
  const norm = normalizeFullName(fullNameRaw);
  const fullName = formatFullNameForDisplay(fullNameRaw);
  if (!norm) return res.status(400).json({ error: "Укажите имя для входа." });
  if (!password.trim()) return res.status(400).json({ error: "Пароль не может быть пустым." });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символа.` });
  }

  const db = readDb();
  const isFirstUser = db.users.length === 0;
  const caller = decodeBearerToken(req.headers.authorization);
  const isAdminCaller = caller && caller.role === "admin";

  if (db.users.some((u) => u.fullNameNormalized === norm)) {
    return res.status(409).json({ error: "Пользователь с таким ФамилияИО уже существует." });
  }

  const role = isFirstUser ? "admin" : isAdminCaller ? (requestedRole === "director" ? "director" : "isolator") : "isolator";
  const uid = makeId("u");
  const user = {
    uid,
    email: syntheticEmailForUid(uid),
    fullName,
    fullNameNormalized: norm,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.users.push(user);
  writeDb(db);

  const token = signToken(user);
  return res.status(201).json({ token, profile: buildProfile(user), bootstrap: isFirstUser });
});

app.post("/api/auth/login", async (req, res) => {
  const fullNameRaw = String(req.body?.fullName || "");
  const password = String(req.body?.password || "");
  const norm = normalizeFullName(fullNameRaw);
  if (!norm || !password) return res.status(400).json({ error: "Нужны fullName и password." });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символа.` });
  }

  const db = readDb();
  const user = db.users.find((u) => u.fullNameNormalized === norm);
  if (!user) return res.status(404).json({ error: "Пользователь с таким ФамилияИО не найден." });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(403).json({ error: "Неверный пароль." });

  return res.json({ token: signToken(user), profile: buildProfile(user) });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.uid === req.auth.uid);
  if (!user) return res.status(404).json({ error: "Пользователь не найден." });
  return res.json({ profile: buildProfile(user) });
});

app.post("/api/auth/logout", (_req, res) => {
  res.status(204).end();
});

app.get("/api/reports", authRequired, (req, res) => {
  const db = readDb();
  const all = req.auth.role === "admin" || req.auth.role === "director";
  const rows = all ? db.reports : db.reports.filter((r) => r.userId === req.auth.uid);
  rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  res.json({ reports: rows });
});

app.get("/api/reports/:id", authRequired, (req, res) => {
  const db = readDb();
  const row = db.reports.find((r) => String(r.id) === String(req.params.id));
  if (!row) return res.status(404).json({ error: "Отчёт не найден." });
  if (req.auth.role !== "admin" && req.auth.role !== "director" && row.userId !== req.auth.uid) {
    return res.status(403).json({ error: "Нет доступа к этому отчёту." });
  }
  return res.json({ report: row });
});

app.post("/api/reports", authRequired, (req, res) => {
  const payload = req.body || {};
  if (!payload || typeof payload !== "object") return res.status(400).json({ error: "Некорректный отчёт." });

  const db = readDb();
  const report = {
    ...payload,
    id: payload.id || makeId("r"),
    userId: req.auth.uid,
    createdAt: Number(payload.createdAt || Date.now())
  };
  db.reports.push(report);
  writeDb(db);
  return res.status(201).json({ report });
});

app.post("/api/admin/users", authRequired, adminRequired, async (req, res) => {
  const db = readDb();
  const fullNameRaw = String(req.body?.fullName || "");
  const password = String(req.body?.password || "");
  const requestedRole = req.body?.requestedRole === "director" ? "director" : "isolator";
  const norm = normalizeFullName(fullNameRaw);
  const fullName = formatFullNameForDisplay(fullNameRaw);

  if (!norm) return res.status(400).json({ error: "Укажите ФамилияИО." });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символа.` });
  }
  if (db.users.some((u) => u.fullNameNormalized === norm)) {
    return res.status(409).json({ error: "Пользователь с таким ФамилияИО уже существует." });
  }

  const uid = makeId("u");
  const user = {
    uid,
    email: syntheticEmailForUid(uid),
    fullName,
    fullNameNormalized: norm,
    passwordHash: await bcrypt.hash(password, 10),
    role: requestedRole,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.users.push(user);
  writeDb(db);
  return res.status(201).json({ profile: buildProfile(user) });
});

app.get("/api/admin/users", authRequired, adminRequired, (req, res) => {
  const db = readDb();
  const users = db.users
    .map((u) => buildProfile(u))
    .sort((a, b) => {
      if (a.role === "admin" && b.role !== "admin") return -1;
      if (b.role === "admin" && a.role !== "admin") return 1;
      return (a.fullName || "").localeCompare(b.fullName || "", "ru-RU");
    });
  return res.json({ users });
});

app.use((error, _req, res, _next) => {
  console.error("[backend] unhandled error", error);
  res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
});
