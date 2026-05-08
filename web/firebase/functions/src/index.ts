import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import bcrypt from "bcryptjs";
import { formatFullNameForDisplay, hasPatronymic, normalizeFullName } from "./normalizeFullName.js";

if (!admin.apps.length) {
  admin.initializeApp();
}

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const BLOCK_DURATION_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;
const REGISTER_MAX_ATTEMPTS = 4;
const REGISTER_WINDOW_MS = 30 * 60 * 1000;
const REGISTER_BLOCK_DURATION_MS = 30 * 60 * 1000;

type UserRole = "admin" | "director" | "isolator";

function sanitizeKey(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120);
}

function extractCallerKey(request: { rawRequest?: { ip?: string; headers?: Record<string, unknown> } }): string {
  const ipRaw =
    request.rawRequest?.ip ||
    request.rawRequest?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    "unknown";
  return sanitizeKey(ipRaw);
}

function syntheticEmailForUid(uid: string): string {
  const safe = uid.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "user"}@pto.local`;
}

function resolveRole(requestedRole: unknown, isAdmin: boolean): UserRole {
  if (!isAdmin) return "isolator";
  return requestedRole === "director" || requestedRole === "admin" ? requestedRole : "isolator";
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) return String((error as { message: unknown }).message);
  return "";
}

function toRegisterHttpsError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  const rawMessage = extractErrorMessage(error).toLowerCase();

  if (
    rawMessage.includes("firestore") ||
    rawMessage.includes("database") ||
    rawMessage.includes("identity toolkit") ||
    rawMessage.includes("permission_denied")
  ) {
    return new HttpsError(
      "failed-precondition",
      "Сервер регистрации не настроен. Проверьте, что в Firebase включены Authentication и Firestore."
    );
  }

  return new HttpsError("internal", "Не удалось создать пользователя.");
}

async function registerFailure(db: admin.firestore.Firestore, callerKey: string, now: number): Promise<void> {
  const lockRef = db.collection("authRegisterRateLimits").doc(callerKey);
  const lockSnap = await lockRef.get();
  const lockData = lockSnap.data() as
    | {
        failCount?: number;
        firstFailAtMs?: number;
      }
    | undefined;
  const prevCount = lockData?.failCount ?? 0;
  const firstFailAtMs =
    lockData?.firstFailAtMs && now - lockData.firstFailAtMs < REGISTER_WINDOW_MS ? lockData.firstFailAtMs : now;
  const nextCount = now - firstFailAtMs >= REGISTER_WINDOW_MS ? 1 : prevCount + 1;
  const nextBlockedUntilMs = nextCount >= REGISTER_MAX_ATTEMPTS ? now + REGISTER_BLOCK_DURATION_MS : 0;
  await lockRef.set(
    {
      failCount: nextCount,
      firstFailAtMs,
      blockedUntilMs: nextBlockedUntilMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export const loginByFullName = onCall({ region: "us-central1" }, async (request) => {
  const fullName = request.data?.fullName;
  const password = request.data?.password;
  if (typeof fullName !== "string" || typeof password !== "string") {
    throw new HttpsError("invalid-argument", "Нужны fullName и password");
  }

  const norm = normalizeFullName(fullName);
  if (!norm) {
    throw new HttpsError("invalid-argument", "Пустое ФамилияИО");
  }

  const db = admin.firestore();
  const callerKey = extractCallerKey(request);
  const lockRef = db.collection("authRateLimits").doc(callerKey);
  const now = Date.now();
  const lockSnap = await lockRef.get();
  const lockData = lockSnap.data() as
    | {
        failCount?: number;
        firstFailAtMs?: number;
        blockedUntilMs?: number;
      }
    | undefined;
  const blockedUntilMs = lockData?.blockedUntilMs ?? 0;
  if (blockedUntilMs > now) {
    throw new HttpsError("resource-exhausted", "Слишком много попыток входа. Попробуйте позже.");
  }

  const snap = await db.collection("users").where("fullNameNormalized", "==", norm).limit(1).get();

  if (snap.empty) {
    const prevCount = lockData?.failCount ?? 0;
    const firstFailAtMs =
      lockData?.firstFailAtMs && now - lockData.firstFailAtMs < ATTEMPT_WINDOW_MS ? lockData.firstFailAtMs : now;
    const nextCount = now - firstFailAtMs >= ATTEMPT_WINDOW_MS ? 1 : prevCount + 1;
    const nextBlockedUntilMs = nextCount >= MAX_FAILED_ATTEMPTS ? now + BLOCK_DURATION_MS : 0;
    await lockRef.set(
      {
        failCount: nextCount,
        firstFailAtMs,
        blockedUntilMs: nextBlockedUntilMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    throw new HttpsError("not-found", "Пользователь не найден");
  }

  const doc = snap.docs[0];
  const data = doc.data();
  const hash = data.passwordHash as string | undefined;
  const passwordOk = !!hash && bcrypt.compareSync(password, hash);
  if (!passwordOk) {
    const prevCount = lockData?.failCount ?? 0;
    const firstFailAtMs =
      lockData?.firstFailAtMs && now - lockData.firstFailAtMs < ATTEMPT_WINDOW_MS ? lockData.firstFailAtMs : now;
    const nextCount = now - firstFailAtMs >= ATTEMPT_WINDOW_MS ? 1 : prevCount + 1;
    const nextBlockedUntilMs =
      nextCount >= MAX_FAILED_ATTEMPTS ? now + BLOCK_DURATION_MS : 0;
    await lockRef.set(
      {
        failCount: nextCount,
        firstFailAtMs,
        blockedUntilMs: nextBlockedUntilMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    throw new HttpsError("permission-denied", "Неверный пароль");
  }

  await lockRef.set(
    {
      failCount: 0,
      firstFailAtMs: 0,
      blockedUntilMs: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  const role = data.role === "admin" || data.role === "director" ? data.role : "isolator";
  const token = await admin.auth().createCustomToken(doc.id, { role });
  return { token };
});

export const registerByFullName = onCall({ region: "us-central1" }, async (request) => {
  const fullName = request.data?.fullName;
  const password = request.data?.password;
  const requestedRole = request.data?.requestedRole;
  if (typeof fullName !== "string" || typeof password !== "string") {
    throw new HttpsError("invalid-argument", "Нужны fullName и password");
  }

  const isAdmin = request.auth?.token?.role === "admin";
  if (request.auth && !isAdmin) {
    throw new HttpsError("permission-denied", "Только администратор может создавать пользователей в админ-режиме.");
  }

  const db = admin.firestore();
  const hasAnyUsersSnap = await db.collection("users").limit(1).get();
  const isBootstrapRegistration = hasAnyUsersSnap.empty;
  const now = Date.now();
  const callerKey = !isAdmin ? extractCallerKey(request) : "";

  const norm = normalizeFullName(fullName);
  const displayFullName = formatFullNameForDisplay(fullName);
  if (!norm) {
    throw new HttpsError("invalid-argument", "Укажите имя для входа.");
  }

  const isSelfRegistration = !request.auth;
  const shouldUseStrictPolicy = !isBootstrapRegistration && isSelfRegistration;
  if (shouldUseStrictPolicy) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символов.`
      );
    }
    if (!hasPatronymic(fullName)) {
      throw new HttpsError(
        "invalid-argument",
        "Для обычной регистрации укажите ФамилияИО с отчеством."
      );
    }
  } else if (password.length < 1) {
    throw new HttpsError("invalid-argument", "Пароль не может быть пустым.");
  }

  if (!isAdmin) {
    const lockRef = db.collection("authRegisterRateLimits").doc(callerKey);
    const lockSnap = await lockRef.get();
    const lockData = lockSnap.data() as
      | {
          failCount?: number;
          firstFailAtMs?: number;
          blockedUntilMs?: number;
        }
      | undefined;
    const blockedUntilMs = lockData?.blockedUntilMs ?? 0;
    if (blockedUntilMs > now) {
      throw new HttpsError("resource-exhausted", "Слишком много попыток регистрации. Попробуйте позже.");
    }
  }

  const existing = await db.collection("users").where("fullNameNormalized", "==", norm).limit(1).get();
  if (!existing.empty) {
    if (!isAdmin) await registerFailure(db, callerKey, now);
    throw new HttpsError("already-exists", "Пользователь с таким ФамилияИО уже существует.");
  }

  // Bootstrap path: the very first registered account becomes admin automatically.
  // Initial owner account is created with relaxed rules; next self-registrations are strict.
  const role: UserRole = isBootstrapRegistration ? "admin" : resolveRole(requestedRole, isAdmin);
  const uid = db.collection("users").doc().id;
  const email = syntheticEmailForUid(uid);
  const passwordHash = bcrypt.hashSync(password, 10);
  const usersRef = db.collection("users").doc(uid);

  try {
    await admin.auth().createUser({
      uid,
      displayName: displayFullName
    });
    await admin.auth().setCustomUserClaims(uid, { role });
    await usersRef.set({
      uid,
      email,
      fullName: displayFullName,
      fullNameNormalized: norm,
      passwordHash,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    if (!isAdmin) await registerFailure(db, callerKey, now);
    try {
      await admin.auth().deleteUser(uid);
    } catch {
      // ignore cleanup error
    }
    throw toRegisterHttpsError(error);
  }

  if (!isAdmin) {
    await db.collection("authRegisterRateLimits").doc(callerKey).set(
      {
        failCount: 0,
        firstFailAtMs: 0,
        blockedUntilMs: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    const token = await admin.auth().createCustomToken(uid, { role });
    return { token, role, bootstrap: isBootstrapRegistration };
  }

  return { uid, role, bootstrap: isBootstrapRegistration };
});
