import type { Report } from "../types";
import { isFirebaseConfigured, db } from "./firebase";
import { apiRequest } from "./apiClient";
import { isApiConfigured } from "./runtimeConfig";
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
  if (isApiConfigured) {
    await apiRequest<{ report: Report }>("/api/reports", {
      method: "POST",
      body: JSON.stringify(report)
    });
    return;
  }
  if (!isFirebaseConfigured) {
    saveReport(report);
    return;
  }
  const { id: _id, ...payload } = report;
  await addDoc(collection(db, "reports"), payload);
}

export async function fetchReportById(id: string): Promise<Report | null> {
  if (isApiConfigured) {
    try {
      const { report } = await apiRequest<{ report: Report }>(`/api/reports/${id}`);
      return normalizeReport(report);
    } catch {
      return null;
    }
  }
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
  if (isApiConfigured) {
    let disposed = false;
    const emit = async () => {
      try {
        const { reports } = await apiRequest<{ reports: Report[] }>("/api/reports");
        if (!disposed) callback(reports.filter((r) => r.userId === userId).map((r) => normalizeReport(r)));
      } catch {
        if (!disposed) onError?.("Не удалось загрузить отчёты. Проверьте сеть.");
      }
    };
    void emit();
    const timer = window.setInterval(() => void emit(), 4000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }
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
  if (isApiConfigured) {
    let disposed = false;
    const emit = async () => {
      try {
        const { reports } = await apiRequest<{ reports: Report[] }>("/api/reports");
        if (!disposed) callback(reports.map((r) => normalizeReport(r)));
      } catch {
        if (!disposed) onError?.("Не удалось загрузить отчёты. Проверьте сеть.");
      }
    };
    void emit();
    const timer = window.setInterval(() => void emit(), 4000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }
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
