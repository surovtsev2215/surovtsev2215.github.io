import type { Report } from "../types";
import { apiRequest } from "./apiClient";
import { isApiConfigured, isDemoAllowed } from "./runtimeConfig";
import { normalizeReport } from "./reportAggregations";

const KEY = "pto-demo-reports";
const EVENT = "pto-demo-reports-changed";
const REPORT_POLL_INTERVAL_MS = 12000;
const REPORT_CACHE_TTL_MS = 5000;
let reportsCache: { at: number; rows: Report[] } | null = null;

function assertApiOrDemo() {
  if (!isApiConfigured && !isDemoAllowed) {
    throw new Error("Отчёты доступны только через подключённый сервер.");
  }
}

function getDemoReports(): Report[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || "[]") as Report[])
      .map((r) => normalizeReport(r))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function saveDemoReport(report: Report) {
  const items = getDemoReports();
  items.unshift(report);
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 2000)));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export async function createReport(report: Report) {
  assertApiOrDemo();
  if (isApiConfigured) {
    await apiRequest<{ report: Report }>("/api/reports", {
      method: "POST",
      body: JSON.stringify(report),
      timeoutMs: 120000
    });
    reportsCache = null;
    return;
  }
  saveDemoReport(report);
}

export async function fetchReportById(id: string): Promise<Report | null> {
  assertApiOrDemo();
  if (isApiConfigured) {
    try {
      const { report } = await apiRequest<{ report: Report }>(`/api/reports/${id}`);
      return normalizeReport(report);
    } catch {
      return null;
    }
  }
  return getDemoReports().find((r) => r.id === id) ?? null;
}

export function subscribeReportsByUser(
  userId: string,
  callback: (rows: Report[]) => void,
  onError?: (message: string) => void,
  autoRefresh = true
) {
  assertApiOrDemo();
  if (isApiConfigured) {
    let disposed = false;
    let inFlight = false;
    const emitFromCache = () => {
      if (!reportsCache) return false;
      if (Date.now() - reportsCache.at > REPORT_CACHE_TTL_MS) return false;
      callback(reportsCache.rows.filter((r) => r.userId === userId).map((r) => normalizeReport(r)));
      return true;
    };
    const emit = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { reports } = await apiRequest<{ reports: Report[] }>("/api/reports");
        reportsCache = { at: Date.now(), rows: reports };
        if (!disposed) callback(reports.filter((r) => r.userId === userId).map((r) => normalizeReport(r)));
      } catch {
        if (!disposed) onError?.("Не удалось загрузить отчёты. Проверьте сеть.");
      } finally {
        inFlight = false;
      }
    };
    emitFromCache();
    void emit();
    const timer = autoRefresh
      ? window.setInterval(() => {
          if (document.hidden) return;
          void emit();
        }, REPORT_POLL_INTERVAL_MS)
      : null;
    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }

  const emit = () => callback(getDemoReports().filter((r) => r.userId === userId));
  emit();
  window.addEventListener(EVENT, emit);
  return () => window.removeEventListener(EVENT, emit);
}

export function subscribeAllReports(
  callback: (rows: Report[]) => void,
  onError?: (message: string) => void,
  autoRefresh = true
) {
  assertApiOrDemo();
  if (isApiConfigured) {
    let disposed = false;
    let inFlight = false;
    const emitFromCache = () => {
      if (!reportsCache) return false;
      if (Date.now() - reportsCache.at > REPORT_CACHE_TTL_MS) return false;
      callback(reportsCache.rows.map((r) => normalizeReport(r)));
      return true;
    };
    const emit = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { reports } = await apiRequest<{ reports: Report[] }>("/api/reports");
        reportsCache = { at: Date.now(), rows: reports };
        if (!disposed) callback(reports.map((r) => normalizeReport(r)));
      } catch {
        if (!disposed) onError?.("Не удалось загрузить отчёты. Проверьте сеть.");
      } finally {
        inFlight = false;
      }
    };
    emitFromCache();
    void emit();
    const timer = autoRefresh
      ? window.setInterval(() => {
          if (document.hidden) return;
          void emit();
        }, REPORT_POLL_INTERVAL_MS)
      : null;
    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
    };
  }

  const emit = () => callback(getDemoReports());
  emit();
  window.addEventListener(EVENT, emit);
  return () => window.removeEventListener(EVENT, emit);
}
