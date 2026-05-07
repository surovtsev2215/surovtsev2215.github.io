import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const env = import.meta.env;

const firebaseConfig = {
  apiKey: (env.VITE_FIREBASE_API_KEY as string) ?? "",
  authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string) ?? "",
  projectId: (env.VITE_FIREBASE_PROJECT_ID as string) ?? "",
  storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET as string) ?? "",
  messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) ?? "",
  appId: (env.VITE_FIREBASE_APP_ID as string) ?? ""
};

export const isFirebaseConfigured =
  Object.values(firebaseConfig).every((v) => typeof v === "string" && v.length > 0);

// #region agent log
fetch("http://127.0.0.1:7653/ingest/20d63d97-1111-4b46-9651-c2ddf66cae7c", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cddc9f" },
  body: JSON.stringify({
    sessionId: "cddc9f",
    runId: "pre-fix",
    hypothesisId: "H1",
    location: "src/lib/firebase.ts:isFirebaseConfigured",
    message: "firebase config presence check",
    data: {
      hasApiKey: Boolean(firebaseConfig.apiKey),
      hasAuthDomain: Boolean(firebaseConfig.authDomain),
      hasProjectId: Boolean(firebaseConfig.projectId),
      hasStorageBucket: Boolean(firebaseConfig.storageBucket),
      hasMessagingSenderId: Boolean(firebaseConfig.messagingSenderId),
      hasAppId: Boolean(firebaseConfig.appId),
      isFirebaseConfigured
    },
    timestamp: Date.now()
  })
}).catch(() => {});
// #endregion

if (!isFirebaseConfigured) {
  // #region agent log
  fetch("http://127.0.0.1:7653/ingest/20d63d97-1111-4b46-9651-c2ddf66cae7c", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cddc9f" },
    body: JSON.stringify({
      sessionId: "cddc9f",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "src/lib/firebase.ts:throwNotConfigured",
      message: "firebase config missing, throwing hard error",
      data: { isFirebaseConfigured },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
  throw new Error(
    "Firebase не настроен. Заполните VITE_FIREBASE_* в web/frontend/.env.local. Demo-режим отключен."
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");

if (isFirebaseConfigured) {
  enableIndexedDbPersistence(db).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[firebase] IndexedDB persistence disabled:", message);
  });
}

export default app;
