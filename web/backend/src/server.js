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
const DB_WRITE_DEBOUNCE_MS = 40;

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

const MIN_PASSWORD_LENGTH = 2;
const ITR_ALLOWED_SECTIONS = ["home", "reports", "team", "tasks", "analytics", "approvals", "profile"];

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

let dbCache = null;
let pendingWriteTimer = null;
let latestSerializedDb = "";

function flushDbNow() {
  if (!latestSerializedDb) return;
  ensureDb();
  fs.writeFileSync(DATA_FILE, latestSerializedDb, "utf8");
}

function readDb() {
  if (dbCache) return dbCache;
  ensureDb();
  const db = parseJsonSafe(fs.readFileSync(DATA_FILE, "utf8"), { users: [], reports: [], tasks: [] });
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.reports)) db.reports = [];
  if (!Array.isArray(db.tasks)) db.tasks = [];
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

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function buildProfile(user) {
  const allowedSections = Array.isArray(user.allowedSections)
    ? Array.from(new Set(user.allowedSections.map((value) => String(value || "").trim())))
        .filter((section) => ITR_ALLOWED_SECTIONS.includes(section))
    : undefined;
  return {
    uid: user.uid,
    email: user.email,
    fullName: user.fullName,
    position: typeof user.position === "string" ? user.position : "",
    phone: typeof user.phone === "string" ? user.phone : "",
    telegram: typeof user.telegram === "string" ? user.telegram : "",
    role: user.role,
    allowedSections,
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

function directorOrAdminRequired(req, res, next) {
  if (!req.auth || (req.auth.role !== "admin" && req.auth.role !== "director")) {
    return res.status(403).json({ error: "Доступно только для ИТР или администратора." });
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
  const requestedPosition = String(req.body?.requestedPosition || "").trim();
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
    position: requestedPosition,
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

app.post("/api/auth/change-password", authRequired, async (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.uid === req.auth.uid);
  if (!user) return res.status(404).json({ error: "Пользователь не найден." });

  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Укажите текущий и новый пароль." });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символа.` });
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(403).json({ error: "Текущий пароль введён неверно." });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.updatedAt = nowIso();
  writeDb(db);
  return res.status(204).end();
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
    createdAt: Number(payload.createdAt || Date.now()),
    status: payload.status || "submitted"
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
  const requestedPosition = String(req.body?.requestedPosition || "").trim();
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
    position: requestedPosition,
    passwordHash: await bcrypt.hash(password, 10),
    role: requestedRole,
    allowedSections: requestedRole === "director" ? ITR_ALLOWED_SECTIONS.slice() : undefined,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.users.push(user);
  writeDb(db);
  return res.status(201).json({ profile: buildProfile(user) });
});

app.put("/api/admin/users/:uid", authRequired, adminRequired, async (req, res) => {
  const db = readDb();
  const uid = String(req.params.uid || "");
  const user = db.users.find((u) => u.uid === uid);
  if (!user) return res.status(404).json({ error: "Пользователь не найден." });
  if (user.role === "admin") return res.status(403).json({ error: "Нельзя редактировать администратора через этот метод." });

  const fullNameRaw = String(req.body?.fullName || "");
  const positionRaw = String(req.body?.requestedPosition || req.body?.position || "").trim();
  const password = String(req.body?.password || "");
  const nextRole = req.body?.requestedRole === "director" ? "director" : "isolator";
  const requestedAllowedSections = req.body?.allowedSections;

  const norm = normalizeFullName(fullNameRaw);
  const fullName = formatFullNameForDisplay(fullNameRaw);
  if (!norm) return res.status(400).json({ error: "Укажите ФамилияИО." });

  const duplicate = db.users.find((u) => u.uid !== uid && u.fullNameNormalized === norm);
  if (duplicate) {
    return res.status(409).json({ error: "Пользователь с таким ФамилияИО уже существует." });
  }
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символа.` });
  }
  if (requestedAllowedSections !== undefined && !Array.isArray(requestedAllowedSections)) {
    return res.status(400).json({ error: "allowedSections должен быть массивом строк." });
  }
  const nextAllowedSections = Array.isArray(requestedAllowedSections)
    ? Array.from(new Set(requestedAllowedSections.map((value) => String(value || "").trim()))).filter((section) =>
        ITR_ALLOWED_SECTIONS.includes(section)
      )
    : null;
  if (Array.isArray(requestedAllowedSections) && nextAllowedSections.length !== requestedAllowedSections.length) {
    return res.status(400).json({ error: "allowedSections содержит недопустимые значения." });
  }

  user.fullName = fullName;
  user.fullNameNormalized = norm;
  user.position = positionRaw;
  user.role = nextRole;
  if (nextRole === "director") {
    if (nextAllowedSections) {
      user.allowedSections = nextAllowedSections;
    } else if (!Array.isArray(user.allowedSections) || user.allowedSections.length === 0) {
      user.allowedSections = ITR_ALLOWED_SECTIONS.slice();
    }
  } else {
    delete user.allowedSections;
  }
  if (password) {
    user.passwordHash = await bcrypt.hash(password, 10);
  }
  user.updatedAt = nowIso();

  writeDb(db);
  return res.json({ profile: buildProfile(user) });
});

app.post("/api/admin/users/reset-passwords", authRequired, adminRequired, async (req, res) => {
  const rows = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!rows.length) {
    return res.status(400).json({ error: "Передайте непустой список пользователей для сброса паролей." });
  }

  const seen = new Set();
  for (const item of rows) {
    const uid = String(item?.uid || "").trim();
    const newPassword = String(item?.newPassword || "");
    if (!uid) {
      return res.status(400).json({ error: "Каждая запись должна содержать uid." });
    }
    if (seen.has(uid)) {
      return res.status(400).json({ error: "Список содержит дублирующиеся uid." });
    }
    seen.add(uid);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символа.` });
    }
  }

  const db = readDb();
  const byUid = new Map(db.users.map((user) => [user.uid, user]));
  const results = [];
  let appliedCount = 0;

  for (const item of rows) {
    const uid = String(item.uid || "").trim();
    const newPassword = String(item.newPassword || "");
    const user = byUid.get(uid);
    if (!user) {
      results.push({
        uid,
        applied: false,
        error: "Пользователь не найден."
      });
      continue;
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.updatedAt = nowIso();
    appliedCount += 1;
    results.push({
      uid: user.uid,
      fullName: user.fullName || "",
      role: user.role || "isolator",
      position: user.position || "",
      email: user.email || "",
      applied: true
    });
  }

  writeDb(db);
  return res.json({
    results,
    summary: {
      total: rows.length,
      applied: appliedCount,
      failed: rows.length - appliedCount
    }
  });
});

app.delete("/api/admin/users/:uid", authRequired, adminRequired, (req, res) => {
  const db = readDb();
  const uid = String(req.params.uid || "");
  const index = db.users.findIndex((u) => u.uid === uid);
  if (index === -1) return res.status(404).json({ error: "Пользователь не найден." });

  const target = db.users[index];
  if (target.role === "admin") {
    return res.status(403).json({ error: "Нельзя удалить администратора." });
  }
  if (req.auth?.uid && req.auth.uid === target.uid) {
    return res.status(403).json({ error: "Нельзя удалить текущую учетную запись." });
  }

  db.users.splice(index, 1);
  writeDb(db);
  return res.status(204).end();
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

app.get("/api/users", authRequired, directorOrAdminRequired, (_req, res) => {
  const db = readDb();
  const users = db.users
    .map((u) => buildProfile(u))
    .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "ru-RU"));
  return res.json({ users });
});

function buildTask(task) {
  return {
    id: task.id,
    title: task.title || "",
    description: task.description || "",
    status: task.status === "done" || task.status === "cancelled" ? task.status : "open",
    assigneeUid: task.assigneeUid || "",
    assigneeFullName: task.assigneeFullName || "",
    assigneePosition: task.assigneePosition || "",
    createdByUid: task.createdByUid || "",
    createdByFullName: task.createdByFullName || "",
    createdByPosition: task.createdByPosition || "",
    createdAt: task.createdAt || nowIso(),
    updatedAt: task.updatedAt || task.createdAt || nowIso(),
    dueDate: task.dueDate || "",
    relatedReportId: task.relatedReportId || "",
    relatedReportLabel: task.relatedReportLabel || ""
  };
}

app.get("/api/tasks", authRequired, (req, res) => {
  const db = readDb();
  const scope = String(req.query.scope || "all");
  const status = String(req.query.status || "");
  let rows = db.tasks.slice();
  if (scope === "assignedToMe") rows = rows.filter((t) => t.assigneeUid === req.auth.uid);
  else if (scope === "createdByMe") rows = rows.filter((t) => t.createdByUid === req.auth.uid);
  else {
    if (req.auth.role === "isolator") {
      rows = rows.filter((t) => t.assigneeUid === req.auth.uid);
    }
  }
  if (status === "open" || status === "done" || status === "cancelled") {
    rows = rows.filter((t) => (t.status || "open") === status);
  }
  rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return res.json({ tasks: rows.map(buildTask) });
});

app.post("/api/tasks", authRequired, directorOrAdminRequired, (req, res) => {
  const db = readDb();
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Укажите заголовок задачи." });
  const assigneeUid = String(req.body?.assigneeUid || "").trim();
  if (!assigneeUid) return res.status(400).json({ error: "Выберите исполнителя." });
  const assignee = db.users.find((u) => u.uid === assigneeUid);
  if (!assignee) return res.status(404).json({ error: "Исполнитель не найден." });
  const author = db.users.find((u) => u.uid === req.auth.uid);
  if (!author) return res.status(401).json({ error: "Сессия истекла. Войдите снова." });

  const task = {
    id: makeId("t"),
    title,
    description: String(req.body?.description || ""),
    status: "open",
    assigneeUid,
    assigneeFullName: assignee.fullName || "",
    assigneePosition: assignee.position || "",
    createdByUid: author.uid,
    createdByFullName: author.fullName || "",
    createdByPosition: author.position || "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    dueDate: req.body?.dueDate ? String(req.body.dueDate) : "",
    relatedReportId: req.body?.relatedReportId ? String(req.body.relatedReportId) : "",
    relatedReportLabel: req.body?.relatedReportLabel ? String(req.body.relatedReportLabel) : ""
  };
  db.tasks.push(task);
  writeDb(db);
  return res.status(201).json({ task: buildTask(task) });
});

app.put("/api/tasks/:id", authRequired, (req, res) => {
  const db = readDb();
  const id = String(req.params.id || "");
  const task = db.tasks.find((t) => t.id === id);
  if (!task) return res.status(404).json({ error: "Задача не найдена." });

  const isAuthor = task.createdByUid === req.auth.uid;
  const isAssignee = task.assigneeUid === req.auth.uid;
  const isAdmin = req.auth.role === "admin";

  if (!isAuthor && !isAssignee && !isAdmin) {
    return res.status(403).json({ error: "Нет доступа к редактированию этой задачи." });
  }

  if (typeof req.body?.status === "string") {
    const next = req.body.status;
    if (next === "open" || next === "done" || next === "cancelled") {
      task.status = next;
    }
  }

  if (isAuthor || isAdmin) {
    if (typeof req.body?.title === "string" && req.body.title.trim()) task.title = req.body.title.trim();
    if (typeof req.body?.description === "string") task.description = req.body.description;
    if (typeof req.body?.assigneeUid === "string" && req.body.assigneeUid.trim()) {
      const assignee = db.users.find((u) => u.uid === req.body.assigneeUid);
      if (assignee) {
        task.assigneeUid = assignee.uid;
        task.assigneeFullName = assignee.fullName || "";
        task.assigneePosition = assignee.position || "";
      }
    }
    if (req.body?.dueDate === null || req.body?.dueDate === "") task.dueDate = "";
    else if (typeof req.body?.dueDate === "string") task.dueDate = req.body.dueDate;
    if (req.body?.relatedReportId === null || req.body?.relatedReportId === "") task.relatedReportId = "";
    else if (typeof req.body?.relatedReportId === "string") task.relatedReportId = req.body.relatedReportId;
    if (typeof req.body?.relatedReportLabel === "string") task.relatedReportLabel = req.body.relatedReportLabel;
  }

  task.updatedAt = nowIso();
  writeDb(db);
  return res.json({ task: buildTask(task) });
});

app.delete("/api/tasks/:id", authRequired, (req, res) => {
  const db = readDb();
  const id = String(req.params.id || "");
  const idx = db.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: "Задача не найдена." });

  const task = db.tasks[idx];
  const isAuthor = task.createdByUid === req.auth.uid;
  const isAdmin = req.auth.role === "admin";
  if (!isAuthor && !isAdmin) {
    return res.status(403).json({ error: "Удалять задачу может автор или администратор." });
  }
  db.tasks.splice(idx, 1);
  writeDb(db);
  return res.status(204).end();
});

app.post("/api/reports/:id/review", authRequired, directorOrAdminRequired, (req, res) => {
  const db = readDb();
  const id = String(req.params.id || "");
  const report = db.reports.find((r) => String(r.id) === id);
  if (!report) return res.status(404).json({ error: "Отчёт не найден." });
  const status = req.body?.status;
  if (status !== "approved" && status !== "needs_fix" && status !== "submitted") {
    return res.status(400).json({ error: "Некорректный статус." });
  }
  const reviewer = db.users.find((u) => u.uid === req.auth.uid);
  report.status = status;
  report.review = {
    byUid: req.auth.uid,
    byFullName: reviewer?.fullName || "",
    byPosition: reviewer?.position || "",
    note: typeof req.body?.note === "string" ? req.body.note : "",
    decidedAt: nowIso()
  };
  writeDb(db);
  return res.json({ report });
});

app.use((error, _req, res, _next) => {
  console.error("[backend] unhandled error", error);
  res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
});

process.on("beforeExit", flushDbNow);
process.on("SIGINT", () => {
  try {
    flushDbNow();
  } finally {
    process.exit(0);
  }
});
process.on("SIGTERM", () => {
  try {
    flushDbNow();
  } finally {
    process.exit(0);
  }
});
