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
exports.loginByFullName = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const normalizeFullName_js_1 = require("./normalizeFullName.js");
if (!admin.apps.length) {
    admin.initializeApp();
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
    const snap = await db.collection("users").where("fullNameNormalized", "==", norm).limit(1).get();
    if (snap.empty) {
        throw new https_1.HttpsError("not-found", "Пользователь не найден");
    }
    const doc = snap.docs[0];
    const data = doc.data();
    const hash = data.passwordHash;
    if (!hash || !bcryptjs_1.default.compareSync(password, hash)) {
        throw new https_1.HttpsError("permission-denied", "Неверный пароль");
    }
    const role = data.role === "admin" || data.role === "director" ? data.role : "isolator";
    const token = await admin.auth().createCustomToken(doc.id, { role });
    return { token };
});
