import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { isApiConfigured } from "./runtimeConfig";

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

if (!isFirebaseConfigured && !isApiConfigured) {
  throw new Error(
    "Firebase не настроен. Заполните VITE_FIREBASE_* в web/frontend/.env.local. Demo-режим отключен."
  );
}

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : (null as unknown as ReturnType<typeof getAuth>);
export const db = app ? getFirestore(app) : (null as unknown as ReturnType<typeof getFirestore>);
export const storage = app ? getStorage(app) : (null as unknown as ReturnType<typeof getStorage>);
export const functions = app ? getFunctions(app, "us-central1") : (null as unknown as ReturnType<typeof getFunctions>);

if (isFirebaseConfigured) {
  enableIndexedDbPersistence(db).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[firebase] IndexedDB persistence disabled:", message);
  });
}

export default app;
