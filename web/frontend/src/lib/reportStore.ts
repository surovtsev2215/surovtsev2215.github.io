import type { Report } from "../types";
import { apiRequest, getApiToken } from "./apiClient";
import { buildApiUrl, isApiConfigured, isDemoAllowed } from "./runtimeConfig";
import { normalizeReport } from "./reportAggregations";

const KEY = "pto-demo-reports";
const EVENT = "pto-demo-reports-changed";
const REPORT_POLL_INTERVAL_MS = 45000;
const REPORT_CACHE_TTL_MS = 5000;

let reportsCache: { at: number; rows: Report[] } | null = null;
let reportsListEtag: string | null = null;

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

async function fetchReportsFromApi(options?: {
  userId?: string;
  since?: number;
}): Promise<Report[]> {
  const params = new URLSearchParams();
  params.set("limit", "500");
  if (options?.since && options.since > 0) params.set("since", String(options.since));

  const token = getApiToken();
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (reportsListEtag) headers["If-None-Match"] = reportsListEtag;

  const res = await fetch(buildApiUrl(`/api/reports?${params.toString()}`), { headers });
  if (res.status === 304 && reportsCache) {
    return reportsCache.rows;
  }
  if (!res.ok) {
    let message = `Ошибка загрузки отчётов (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* noop */
    }
    throw new Error(message);
  }
  const etag = res.headers.get("ETag");
  if (etag) reportsListEtag = etag;
  const data = (await res.json()) as { reports: Report[] };
  const rows = data.reports.map((r) => normalizeReport(r));
  reportsCache = { at: Date.now(), rows };
  return rows;
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
    reportsListEtag = null;
    return;
  }
  saveDemoReport(report);
}

function replaceDemoReport(report: Report) {
  const items = getDemoReports();
  const index = items.findIndex((r) => r.id === report.id);
  if (index === -1) throw new Error("Отчёт не найден.");
  items[index] = report;
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 2000)));
  window.dispatchEvent(new CustomEvent(EVENT));
}

function removeDemoReport(id: string) {
  const items = getDemoReports().filter((r) => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export async function updateReport(report: Report): Promise<Report> {
  assertApiOrDemo();
  if (!report.id) throw new Error("Не указан идентификатор отчёта.");
  if (isApiConfigured) {
    const { report: updated } = await apiRequest<{ report: Report }>(`/api/reports/${report.id}`, {
      method: "PUT",
      body: JSON.stringify(report),
      timeoutMs: 120000
    });
    reportsCache = null;
    reportsListEtag = null;
    return normalizeReport(updated);
  }
  const normalized = normalizeReport(report);
  replaceDemoReport(normalized);
  return normalized;
}

export async function deleteReport(id: string): Promise<void> {
  assertApiOrDemo();
  if (isApiConfigured) {
    await apiRequest(`/api/reports/${id}`, { method: "DELETE" });
    reportsCache = null;
    reportsListEtag = null;
    return;
  }
  removeDemoReport(id);
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
        const rows = await fetchReportsFromApi();
        if (!disposed) {
          callback(rows.filter((r) => r.userId === userId).map((r) => normalizeReport(r)));
        }
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
        const rows = await fetchReportsFromApi();
        if (!disposed) callback(rows.map((r) => normalizeReport(r)));
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

export function invalidateReportsListCache() {
  reportsCache = null;
  reportsListEtag = null;
}
