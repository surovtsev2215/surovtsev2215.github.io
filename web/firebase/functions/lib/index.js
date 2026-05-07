"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerByFullName = exports.loginByFullName = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const normalizeFullName_js_1 = require("./normalizeFullName.js");
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
function sanitizeKey(input) {
    return input.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120);
}
function extractCallerKey(request) {
    const ipRaw = request.rawRequest?.ip ||
        request.rawRequest?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
        "unknown";
    return sanitizeKey(ipRaw);
}
function syntheticEmailForUid(uid) {
    const safe = uid.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "");
    return `${safe || "user"}@pto.local`;
}
function resolveRole(requestedRole, isAdmin) {
    if (!isAdmin)
        return "isolator";
    return requestedRole === "director" || requestedRole === "admin" ? requestedRole : "isolator";
}
async function registerFailure(db, callerKey, now) {
    const lockRef = db.collection("authRegisterRateLimits").doc(callerKey);
    const lockSnap = await lockRef.get();
    const lockData = lockSnap.data();
    const prevCount = lockData?.failCount ?? 0;
    const firstFailAtMs = lockData?.firstFailAtMs && now - lockData.firstFailAtMs < REGISTER_WINDOW_MS ? lockData.firstFailAtMs : now;
    const nextCount = now - firstFailAtMs >= REGISTER_WINDOW_MS ? 1 : prevCount + 1;
    const nextBlockedUntilMs = nextCount >= REGISTER_MAX_ATTEMPTS ? now + REGISTER_BLOCK_DURATION_MS : 0;
    await lockRef.set({
        failCount: nextCount,
        firstFailAtMs,
        blockedUntilMs: nextBlockedUntilMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}
exports.loginByFullName = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    const fullName = request.data?.fullName;
    const password = request.data?.password;
    if (typeof fullName !== "string" || typeof password !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Нужны fullName и password");
    }
    const norm = (0, normalizeFullName_js_1.normalizeFullName)(fullName);
    if (!norm) {
        throw new https_1.HttpsError("invalid-argument", "Пустое ФИО");
    }
    const db = admin.firestore();
    const callerKey = extractCallerKey(request);
    const lockRef = db.collection("authRateLimits").doc(callerKey);
    const now = Date.now();
    const lockSnap = await lockRef.get();
    const lockData = lockSnap.data();
    const blockedUntilMs = lockData?.blockedUntilMs ?? 0;
    if (blockedUntilMs > now) {
        throw new https_1.HttpsError("resource-exhausted", "Слишком много попыток входа. Попробуйте позже.");
    }
    const snap = await db.collection("users").where("fullNameNormalized", "==", norm).limit(1).get();
    if (snap.empty) {
        const prevCount = lockData?.failCount ?? 0;
        const firstFailAtMs = lockData?.firstFailAtMs && now - lockData.firstFailAtMs < ATTEMPT_WINDOW_MS ? lockData.firstFailAtMs : now;
        const nextCount = now - firstFailAtMs >= ATTEMPT_WINDOW_MS ? 1 : prevCount + 1;
        const nextBlockedUntilMs = nextCount >= MAX_FAILED_ATTEMPTS ? now + BLOCK_DURATION_MS : 0;
        await lockRef.set({
            failCount: nextCount,
            firstFailAtMs,
            blockedUntilMs: nextBlockedUntilMs,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        throw new https_1.HttpsError("not-found", "Пользователь не найден");
    }
    const doc = snap.docs[0];
    const data = doc.data();
    const hash = data.passwordHash;
    const passwordOk = !!hash && bcryptjs_1.default.compareSync(password, hash);
    if (!passwordOk) {
        const prevCount = lockData?.failCount ?? 0;
        const firstFailAtMs = lockData?.firstFailAtMs && now - lockData.firstFailAtMs < ATTEMPT_WINDOW_MS ? lockData.firstFailAtMs : now;
        const nextCount = now - firstFailAtMs >= ATTEMPT_WINDOW_MS ? 1 : prevCount + 1;
        const nextBlockedUntilMs = nextCount >= MAX_FAILED_ATTEMPTS ? now + BLOCK_DURATION_MS : 0;
        await lockRef.set({
            failCount: nextCount,
            firstFailAtMs,
            blockedUntilMs: nextBlockedUntilMs,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        throw new https_1.HttpsError("permission-denied", "Неверный пароль");
    }
    await lockRef.set({
        failCount: 0,
        firstFailAtMs: 0,
        blockedUntilMs: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const role = data.role === "admin" || data.role === "director" ? data.role : "isolator";
    const token = await admin.auth().createCustomToken(doc.id, { role });
    return { token };
});
exports.registerByFullName = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    const fullName = request.data?.fullName;
    const password = request.data?.password;
    const requestedRole = request.data?.requestedRole;
    if (typeof fullName !== "string" || typeof password !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Нужны fullName и password");
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new https_1.HttpsError("invalid-argument", `Пароль должен быть минимум ${MIN_PASSWORD_LENGTH} символов.`);
    }
    const norm = (0, normalizeFullName_js_1.normalizeFullName)(fullName);
    if (!norm) {
        throw new https_1.HttpsError("invalid-argument", "Пустое ФИО");
    }
    const isAdmin = request.auth?.token?.role === "admin";
    if (request.auth && !isAdmin) {
        throw new https_1.HttpsError("permission-denied", "Только администратор может создавать пользователей в админ-режиме.");
    }
    const db = admin.firestore();
    const now = Date.now();
    const callerKey = !isAdmin ? extractCallerKey(request) : "";
    if (!isAdmin) {
        const lockRef = db.collection("authRegisterRateLimits").doc(callerKey);
        const lockSnap = await lockRef.get();
        const lockData = lockSnap.data();
        const blockedUntilMs = lockData?.blockedUntilMs ?? 0;
        if (blockedUntilMs > now) {
            throw new https_1.HttpsError("resource-exhausted", "Слишком много попыток регистрации. Попробуйте позже.");
        }
    }
    const existing = await db.collection("users").where("fullNameNormalized", "==", norm).limit(1).get();
    if (!existing.empty) {
        if (!isAdmin)
            await registerFailure(db, callerKey, now);
        throw new https_1.HttpsError("already-exists", "Пользователь с таким ФИО уже существует.");
    }
    // Bootstrap path: the very first registered account becomes admin automatically.
    // This removes the manual "set role in Firestore" step for initial setup.
    const hasAnyUsersSnap = await db.collection("users").limit(1).get();
    const isBootstrapRegistration = hasAnyUsersSnap.empty;
    const role = isBootstrapRegistration ? "admin" : resolveRole(requestedRole, isAdmin);
    const uid = db.collection("users").doc().id;
    const email = syntheticEmailForUid(uid);
    const passwordHash = bcryptjs_1.default.hashSync(password, 10);
    const usersRef = db.collection("users").doc(uid);
    try {
        await admin.auth().createUser({
            uid,
            displayName: fullName.trim()
        });
        await admin.auth().setCustomUserClaims(uid, { role });
        await usersRef.set({
            uid,
            email,
            fullName: fullName.trim(),
            fullNameNormalized: norm,
            passwordHash,
            role,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    catch (error) {
        if (!isAdmin)
            await registerFailure(db, callerKey, now);
        try {
            await admin.auth().deleteUser(uid);
        }
        catch {
            // ignore cleanup error
        }
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError("internal", "Не удалось создать пользователя.");
    }
    if (!isAdmin) {
        await db.collection("authRegisterRateLimits").doc(callerKey).set({
            failCount: 0,
            firstFailAtMs: 0,
            blockedUntilMs: 0,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        const token = await admin.auth().createCustomToken(uid, { role });
        return { token, role, bootstrap: isBootstrapRegistration };
    }
    return { uid, role, bootstrap: isBootstrapRegistration };
});
