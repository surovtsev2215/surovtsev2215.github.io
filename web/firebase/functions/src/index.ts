import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import bcrypt from "bcryptjs";
import { normalizeFullName } from "./normalizeFullName.js";

if (!admin.apps.length) {
  admin.initializeApp();
}

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const BLOCK_DURATION_MS = 15 * 60 * 1000;

function sanitizeKey(input: string): string {
  return input.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120);
}

function extractCallerKey(request: { rawRequest?: { ip?: string; headers?: Record<string, unknown> } }): string {
  const ipRaw =
    request.rawRequest?.ip ||
    request.rawRequest?.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    "unknown";
  return sanitizeKey(ipRaw);
}

export const loginByFullName = onCall({ region: "us-central1" }, async (request) => {
  const fullName = request.data?.fullName;
  const password = request.data?.password;
  if (typeof fullName !== "string" || typeof password !== "string") {
    throw new HttpsError("invalid-argument", "Нужны fullName и password");
  }

  const norm = normalizeFullName(fullName);
  if (!norm) {
    throw new HttpsError("invalid-argument", "Пустое ФИО");
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
