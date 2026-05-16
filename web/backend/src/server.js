import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import * as store from "./db/store.js";
import { isPhotoStorageConfigured, uploadPhotoBuffer } from "./photoStorage.js";
import {
  stripReportPhotosForList,
  validateReportNoBase64Photos,
  reportsListEtag
} from "./reportPhotos.js";
import { normalizeWorkRates } from "./workRates.js";

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 }
});

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

const MIN_PASSWORD_LENGTH = 2;
const ITR_ALLOWED_SECTIONS = ["reports", "timesheets", "team", "tasks", "approvals", "profile"];

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

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function buildProfile(user) {
  const allowedSections = Array.isArray(user.allowedSections)
    ? Array.from(new Set(user.allowedSections.map((value) => String(value || "").trim()))).filter((section) =>
        ITR_ALLOWED_SECTIONS.includes(section)
      )
    : undefined;
  return {
    uid: user.uid,
    email: user.email,
    fullName: user.fullName,
    position: typeof user.position === "string" ? user.position : "",
    brigadeNumber: typeof user.brigadeNumber === "string" ? user.brigadeNumber : "",
    isBrigadeLeader: Boolean(user.isBrigadeLeader),
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

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: "50mb" }));

app.get(
  "/api/health",
  asyncRoute(async (_req, res) => {
    res.json({
      ok: true,
      mode: store.getStoreMode(),
      photoStorage: isPhotoStorageConfigured() ? "ok" : "disabled"
    });
  })
);

app.post(
  "/api/uploads",
  authRequired,
  photoUpload.single("file"),
  asyncRoute(async (req, res) => {
    if (!isPhotoStorageConfigured()) {
      return res.status(503).json({
        error: "Облачное хранилище фото не настроено на сервере.",
        code: "PHOTO_STORAGE_DISABLED"
      });
    }
    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ error: "Файл не получен." });
    }
    const mimeRaw = String(file.mimetype || "").toLowerCase();
    const mime = mimeRaw.startsWith("image/") ? mimeRaw : "image/jpeg";
    if (!mime.startsWith("image/")) {
      return res.status(400).json({ error: "Допустимы только файлы изображений." });
    }
    try {
      const { url, thumbUrl } = await uploadPhotoBuffer(req.auth.uid, file.buffer, mime);
      return res.status(201).json({ url, thumbUrl, size: file.size });
    } catch (error) {
      if (error?.code === "PHOTO_STORAGE_DISABLED") {
        return res.status(503).json({ error: "Хранилище фото отключено.", code: error.code });
      }
      throw error;
    }
  })
);

app.post(
  "/api/auth/register",
  asyncRoute(async (req, res) => {
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

    const isFirstUser = (await store.countUsers()) === 0;
    const caller = decodeBearerToken(req.headers.authorization);
    const isAdminCaller = caller && caller.role === "admin";

    if (await store.findUserByNormalized(norm)) {
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
    if (role === "director") {
      user.allowedSections = ITR_ALLOWED_SECTIONS.slice();
    }
    await store.createUser(user);

    const token = signToken(user);
    return res.status(201).json({ token, profile: buildProfile(user), bootstrap: isFirstUser });
  })
);

app.post(
  "/api/auth/login",
  asyncRoute(async (req, res) => {
    const fullNameRaw = String(req.body?.fullName || "");
    const password = String(req.body?.password || "");
    const norm = normalizeFullName(fullNameRaw);
    if (!norm || !password) return res.status(400).json({ error: "Нужны fullName и password." });
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символа.` });
    }

    const user = await store.findUserByNormalized(norm);
    if (!user) return res.status(404).json({ error: "Пользователь с таким ФамилияИО не найден." });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(403).json({ error: "Неверный пароль." });

    return res.json({ token: signToken(user), profile: buildProfile(user) });
  })
);

app.get(
  "/api/auth/me",
  authRequired,
  asyncRoute(async (req, res) => {
    const user = await store.findUserByUid(req.auth.uid);
    if (!user) return res.status(404).json({ error: "Пользователь не найден." });
    return res.json({ profile: buildProfile(user) });
  })
);

app.post("/api/auth/logout", (_req, res) => {
  res.status(204).end();
});

app.post(
  "/api/auth/change-password",
  authRequired,
  asyncRoute(async (req, res) => {
    const user = await store.findUserByUid(req.auth.uid);
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

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await store.updateUser(user.uid, (target) => {
      target.passwordHash = passwordHash;
      target.updatedAt = nowIso();
    });
    return res.status(204).end();
  })
);

function parseReportListFilter(req, auth) {
  const all = auth.role === "admin" || auth.role === "director";
  const filter = all ? {} : { userId: auth.uid };
  if (req.query.from) filter.from = String(req.query.from);
  if (req.query.to) filter.to = String(req.query.to);
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.since) filter.since = Number(req.query.since);
  const limitRaw = Number(req.query.limit);
  filter.limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, limitRaw) : 500;
  const offsetRaw = Number(req.query.offset);
  if (Number.isFinite(offsetRaw) && offsetRaw > 0) filter.offset = offsetRaw;
  return filter;
}

app.get(
  "/api/reports",
  authRequired,
  asyncRoute(async (req, res) => {
    const filter = parseReportListFilter(req, req.auth);
    const rows = await store.listReports(filter);
    const full = req.query.full === "1";
    const reports = full ? rows : rows.map(stripReportPhotosForList);
    const etag = reportsListEtag(reports);
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }
    res.setHeader("ETag", etag);
    res.json({ reports });
  })
);

app.get(
  "/api/reports/summary",
  authRequired,
  asyncRoute(async (req, res) => {
    const filter = parseReportListFilter(req, req.auth);
    const rows = await store.listReports(filter);
    const reports = rows.map(stripReportPhotosForList);
    const etag = reportsListEtag(reports);
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }
    res.setHeader("ETag", etag);
    res.json({ reports });
  })
);

app.get(
  "/api/reports/:id",
  authRequired,
  asyncRoute(async (req, res) => {
    const row = await store.findReportById(req.params.id);
    if (!row) return res.status(404).json({ error: "Отчёт не найден." });
    if (req.auth.role !== "admin" && req.auth.role !== "director" && row.userId !== req.auth.uid) {
      return res.status(403).json({ error: "Нет доступа к этому отчёту." });
    }
    return res.json({ report: row });
  })
);

app.post(
  "/api/reports",
  authRequired,
  asyncRoute(async (req, res) => {
    const payload = req.body || {};
    if (!payload || typeof payload !== "object") return res.status(400).json({ error: "Некорректный отчёт." });

    const report = {
      ...payload,
      id: payload.id || makeId("r"),
      userId: req.auth.uid,
      createdAt: Number(payload.createdAt || Date.now()),
      status: payload.status || "submitted"
    };
    try {
      validateReportNoBase64Photos(report);
    } catch (error) {
      if (error?.code === "BASE64_PHOTO_REJECTED") {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      throw error;
    }
    const bodySize = JSON.stringify(report).length;
    if (bodySize > 45 * 1024 * 1024) {
      return res.status(413).json({
        error: "Отчёт слишком большой. Используйте облачное хранилище фото (R2) и меньше вложений."
      });
    }
    if (bodySize > 2 * 1024 * 1024) {
      console.warn(`[backend] large report POST ${report.id} size=${Math.round(bodySize / 1024)}KB`);
    }
    await store.createReport(report);
    return res.status(201).json({ report });
  })
);

function reportOwnerCanModify(report, auth) {
  if (auth.role === "admin" || auth.role === "director") return true;
  return report.userId === auth.uid;
}

function reportIsLockedForOwner(report) {
  return (report.status || "submitted") === "approved";
}

app.put(
  "/api/reports/:id",
  authRequired,
  asyncRoute(async (req, res) => {
    const id = String(req.params.id || "");
    const existing = await store.findReportById(id);
    if (!existing) return res.status(404).json({ error: "Отчёт не найден." });
    if (!reportOwnerCanModify(existing, req.auth)) {
      return res.status(403).json({ error: "Нет доступа к этому отчёту." });
    }
    if (req.auth.role !== "admin" && req.auth.role !== "director" && reportIsLockedForOwner(existing)) {
      return res.status(403).json({ error: "Согласованный отчёт нельзя изменить." });
    }

    const payload = req.body || {};
    if (!payload || typeof payload !== "object") return res.status(400).json({ error: "Некорректный отчёт." });

    const wasNeedsFix = (existing.status || "submitted") === "needs_fix";
    const ownerResubmit =
      req.auth.role !== "admin" && req.auth.role !== "director" && existing.userId === req.auth.uid;

    const report = {
      ...existing,
      ...payload,
      id: existing.id,
      userId: existing.userId,
      userEmail: existing.userEmail ?? payload.userEmail,
      createdAt: Number(existing.createdAt || payload.createdAt || Date.now())
    };

    if (ownerResubmit && wasNeedsFix) {
      report.status = "submitted";
      report.review = undefined;
    } else if (!report.status) {
      report.status = existing.status || "submitted";
    }

    try {
      validateReportNoBase64Photos(report);
    } catch (error) {
      if (error?.code === "BASE64_PHOTO_REJECTED") {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      throw error;
    }

    const bodySize = JSON.stringify(report).length;
    if (bodySize > 45 * 1024 * 1024) {
      return res.status(413).json({
        error: "Отчёт слишком большой. Используйте облачное хранилище фото (R2) и меньше вложений."
      });
    }

    const updated = await store.updateReport(report);
    if (!updated) return res.status(404).json({ error: "Отчёт не найден." });
    return res.json({ report: updated });
  })
);

app.delete(
  "/api/reports/:id",
  authRequired,
  asyncRoute(async (req, res) => {
    const id = String(req.params.id || "");
    const existing = await store.findReportById(id);
    if (!existing) return res.status(404).json({ error: "Отчёт не найден." });
    if (!reportOwnerCanModify(existing, req.auth)) {
      return res.status(403).json({ error: "Нет доступа к этому отчёту." });
    }
    if (req.auth.role !== "admin" && req.auth.role !== "director" && reportIsLockedForOwner(existing)) {
      return res.status(403).json({ error: "Согласованный отчёт нельзя удалить." });
    }
    const ok = await store.deleteReport(id);
    if (!ok) return res.status(404).json({ error: "Отчёт не найден." });
    return res.status(204).end();
  })
);

app.post(
  "/api/admin/users",
  authRequired,
  adminRequired,
  asyncRoute(async (req, res) => {
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
    if (await store.findUserByNormalized(norm)) {
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
    await store.createUser(user);
    return res.status(201).json({ profile: buildProfile(user) });
  })
);

app.put(
  "/api/admin/users/:uid",
  authRequired,
  adminRequired,
  asyncRoute(async (req, res) => {
    const uid = String(req.params.uid || "");
    const user = await store.findUserByUid(uid);
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

    const duplicate = await store.findUserByNormalized(norm);
    if (duplicate && duplicate.uid !== uid) {
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

    const brigadeNumber = String(req.body?.brigadeNumber ?? "").trim();
    const isBrigadeLeader = Boolean(req.body?.isBrigadeLeader);
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    await store.updateUser(uid, (target) => {
      target.fullName = fullName;
      target.fullNameNormalized = norm;
      target.position = positionRaw;
      target.brigadeNumber = brigadeNumber;
      target.isBrigadeLeader = nextRole === "isolator" ? isBrigadeLeader : false;
      target.role = nextRole;
      if (nextRole === "director") {
        if (nextAllowedSections) {
          target.allowedSections = nextAllowedSections;
        } else if (!Array.isArray(target.allowedSections) || target.allowedSections.length === 0) {
          target.allowedSections = ITR_ALLOWED_SECTIONS.slice();
        }
      } else {
        delete target.allowedSections;
      }
      if (passwordHash) {
        target.passwordHash = passwordHash;
      }
      target.updatedAt = nowIso();
    });

    const updated = await store.findUserByUid(uid);
    return res.json({ profile: buildProfile(updated) });
  })
);

app.post(
  "/api/admin/users/reset-passwords",
  authRequired,
  adminRequired,
  asyncRoute(async (req, res) => {
    const rows = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!rows.length) {
      return res.status(400).json({ error: "Передайте непустой список пользователей для сброса паролей." });
    }

    const seen = new Set();
    for (const item of rows) {
      const uid = String(item?.uid || "").trim();
      const newPassword = String(item?.newPassword || "");
      if (!uid) return res.status(400).json({ error: "Каждая запись должна содержать uid." });
      if (seen.has(uid)) return res.status(400).json({ error: "Список содержит дублирующиеся uid." });
      seen.add(uid);
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символа.` });
      }
    }

    const results = [];
    let appliedCount = 0;

    for (const item of rows) {
      const uid = String(item.uid || "").trim();
      const newPassword = String(item.newPassword || "");
      const user = await store.findUserByUid(uid);
      if (!user) {
        results.push({ uid, applied: false, error: "Пользователь не найден." });
        continue;
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await store.updateUser(uid, (target) => {
        target.passwordHash = passwordHash;
        target.updatedAt = nowIso();
      });
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

    return res.json({
      results,
      summary: { total: rows.length, applied: appliedCount, failed: rows.length - appliedCount }
    });
  })
);

app.delete(
  "/api/admin/users/:uid",
  authRequired,
  adminRequired,
  asyncRoute(async (req, res) => {
    const uid = String(req.params.uid || "");
    const target = await store.findUserByUid(uid);
    if (!target) return res.status(404).json({ error: "Пользователь не найден." });
    if (target.role === "admin") return res.status(403).json({ error: "Нельзя удалить администратора." });
    if (req.auth?.uid && req.auth.uid === target.uid) {
      return res.status(403).json({ error: "Нельзя удалить текущую учетную запись." });
    }
    await store.deleteUser(uid);
    return res.status(204).end();
  })
);

app.get(
  "/api/admin/users",
  authRequired,
  adminRequired,
  asyncRoute(async (_req, res) => {
    const users = (await store.listUsers())
      .map((u) => buildProfile(u))
      .sort((a, b) => {
        if (a.role === "admin" && b.role !== "admin") return -1;
        if (b.role === "admin" && a.role !== "admin") return 1;
        return (a.fullName || "").localeCompare(b.fullName || "", "ru-RU");
      });
    return res.json({ users });
  })
);

app.get(
  "/api/users",
  authRequired,
  directorOrAdminRequired,
  asyncRoute(async (_req, res) => {
    const users = (await store.listUsers())
      .map((u) => buildProfile(u))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "ru-RU"));
    return res.json({ users });
  })
);

app.get(
  "/api/crew/isolators",
  authRequired,
  asyncRoute(async (req, res) => {
    const me = await store.findUserByUid(req.auth.uid);
    let rows = (await store.listUsers()).filter((u) => u.role === "isolator");
    const myBrigade = String(me?.brigadeNumber || "").trim();
    if (myBrigade) {
      rows = rows.filter((u) => {
        const b = String(u.brigadeNumber || "").trim();
        return !b || b === myBrigade;
      });
    }
    const users = rows
      .map((u) => ({
        uid: u.uid,
        fullName: u.fullName,
        position: typeof u.position === "string" ? u.position : "",
        brigadeNumber: typeof u.brigadeNumber === "string" ? u.brigadeNumber : "",
        role: "isolator"
      }))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "ru-RU"));
    return res.json({ users });
  })
);

app.get(
  "/api/tasks",
  authRequired,
  asyncRoute(async (req, res) => {
    const scope = String(req.query.scope || "all");
    const status = String(req.query.status || "");
    let rows = await store.listTasks();
    if (scope === "assignedToMe") rows = rows.filter((t) => t.assigneeUid === req.auth.uid);
    else if (scope === "createdByMe") rows = rows.filter((t) => t.createdByUid === req.auth.uid);
    else if (req.auth.role === "isolator") {
      rows = rows.filter((t) => t.assigneeUid === req.auth.uid);
    }
    if (status === "open" || status === "done" || status === "cancelled") {
      rows = rows.filter((t) => (t.status || "open") === status);
    }
    rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return res.json({ tasks: rows.map(buildTask) });
  })
);

app.post(
  "/api/tasks",
  authRequired,
  directorOrAdminRequired,
  asyncRoute(async (req, res) => {
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "Укажите заголовок задачи." });
    const assigneeUid = String(req.body?.assigneeUid || "").trim();
    if (!assigneeUid) return res.status(400).json({ error: "Выберите исполнителя." });
    const assignee = await store.findUserByUid(assigneeUid);
    if (!assignee) return res.status(404).json({ error: "Исполнитель не найден." });
    const author = await store.findUserByUid(req.auth.uid);
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
    await store.createTask(task);
    return res.status(201).json({ task: buildTask(task) });
  })
);

app.put(
  "/api/tasks/:id",
  authRequired,
  asyncRoute(async (req, res) => {
    const id = String(req.params.id || "");
    const task = await store.findTaskById(id);
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
        const assignee = await store.findUserByUid(req.body.assigneeUid);
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
    await store.updateTask(task);
    return res.json({ task: buildTask(task) });
  })
);

app.delete(
  "/api/tasks/:id",
  authRequired,
  asyncRoute(async (req, res) => {
    const id = String(req.params.id || "");
    const task = await store.findTaskById(id);
    if (!task) return res.status(404).json({ error: "Задача не найдена." });

    const isAuthor = task.createdByUid === req.auth.uid;
    const isAdmin = req.auth.role === "admin";
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: "Удалять задачу может автор или администратор." });
    }
    await store.deleteTask(id);
    return res.status(204).end();
  })
);

const WORK_RATES_KEY = "workRates";

app.get(
  "/api/settings/work-rates",
  authRequired,
  directorOrAdminRequired,
  asyncRoute(async (_req, res) => {
    const raw = await store.getSetting(WORK_RATES_KEY);
    return res.json({ rates: normalizeWorkRates(raw) });
  })
);

app.put(
  "/api/settings/work-rates",
  authRequired,
  directorOrAdminRequired,
  asyncRoute(async (req, res) => {
    const rates = normalizeWorkRates(req.body || {});
    rates.updatedAt = nowIso();
    rates.updatedByUid = req.auth.uid;
    await store.setSetting(WORK_RATES_KEY, rates);
    return res.json({ rates });
  })
);

app.post(
  "/api/reports/:id/review",
  authRequired,
  directorOrAdminRequired,
  asyncRoute(async (req, res) => {
    const id = String(req.params.id || "");
    const report = await store.findReportById(id);
    if (!report) return res.status(404).json({ error: "Отчёт не найден." });
    const status = req.body?.status;
    if (status !== "approved" && status !== "needs_fix" && status !== "submitted") {
      return res.status(400).json({ error: "Некорректный статус." });
    }
    const reviewer = await store.findUserByUid(req.auth.uid);
    report.status = status;
    report.review = {
      byUid: req.auth.uid,
      byFullName: reviewer?.fullName || "",
      byPosition: reviewer?.position || "",
      note: typeof req.body?.note === "string" ? req.body.note : "",
      decidedAt: nowIso()
    };
    await store.updateReport(report);
    return res.json({ report });
  })
);

app.use((error, _req, res, _next) => {
  console.error("[backend] unhandled error", error);
  res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

async function start() {
  await store.initStore();
  app.listen(PORT, () => {
    console.log(`[backend] listening on http://localhost:${PORT} (${store.getStoreMode()})`);
  });
}

start().catch((error) => {
  console.error("[backend] failed to start", error);
  process.exit(1);
});

async function gracefulShutdown() {
  try {
    await store.shutdownStore();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
