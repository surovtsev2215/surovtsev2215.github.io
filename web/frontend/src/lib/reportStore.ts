import type { Report } from "../types";
import { isFirebaseConfigured, db } from "./firebase";
import { normalizeReport } from "./reportAggregations";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where
} from "firebase/firestore";

const KEY = "pto-demo-reports";
const EVENT = "pto-demo-reports-changed";

export function getReports(): Report[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || "[]") as Report[])
      .map((r) => normalizeReport(r))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveReport(report: Report) {
  const items = getReports();
  items.unshift(report);
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 2000)));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export async function createReport(report: Report) {
  if (!isFirebaseConfigured) {
    saveReport(report);
    return;
  }
  const { id: _id, ...payload } = report;
  await addDoc(collection(db, "reports"), payload);
}

export async function fetchReportById(id: string): Promise<Report | null> {
  if (!isFirebaseConfigured) {
    return getReports().find((r) => r.id === id) ?? null;
  }
  const snap = await getDoc(doc(db, "reports", id));
  if (!snap.exists()) return null;
  return normalizeReport({ id: snap.id, ...(snap.data() as Omit<Report, "id">) });
}

export function subscribeReportsByUser(
  userId: string,
  callback: (rows: Report[]) => void,
  onError?: (message: string) => void
) {
  if (!isFirebaseConfigured) {
    const emit = () =>
      callback(getReports().filter((r) => r.userId === userId));
    emit();
    window.addEventListener(EVENT, emit);
    return () => window.removeEventListener(EVENT, emit);
  }

  const q = query(
    collection(db, "reports"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) =>
        normalizeReport({
          id: d.id,
          ...(d.data() as Omit<Report, "id">)
        })
      );
      callback(rows);
    },
    () => {
      onError?.("Не удалось загрузить отчёты. Проверьте сеть.");
    }
  );
}

export function subscribeAllReports(
  callback: (rows: Report[]) => void,
  onError?: (message: string) => void
) {
  if (!isFirebaseConfigured) {
    const emit = () => callback(getReports());
    emit();
    window.addEventListener(EVENT, emit);
    return () => window.removeEventListener(EVENT, emit);
  }

  const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) =>
        normalizeReport({
          id: d.id,
          ...(d.data() as Omit<Report, "id">)
        })
      );
      callback(rows);
    },
    () => {
      onError?.("Не удалось загрузить отчёты. Проверьте сеть.");
    }
  );
}
