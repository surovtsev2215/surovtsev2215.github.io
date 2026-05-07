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

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (v) => typeof v === "string" && v.length > 0
);

// Заглушки нужны только чтобы initializeApp/getAuth/etc. не падали при импорте в demo-режиме
// (когда переменные окружения VITE_FIREBASE_* не заданы и приложение работает на localStorage).
const safeConfig = isFirebaseConfigured
  ? firebaseConfig
  : {
      apiKey: "demo",
      authDomain: "demo.firebaseapp.com",
      projectId: "demo",
      storageBucket: "demo.appspot.com",
      messagingSenderId: "0",
      appId: "demo"
    };

const app = initializeApp(safeConfig);

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
