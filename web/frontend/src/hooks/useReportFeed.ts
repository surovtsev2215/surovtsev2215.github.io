import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { subscribeAllReports } from "../lib/reportStore";
import {
  getReportJointsCount,
  getReportTotalLength,
  matchesText
} from "../lib/reportAggregations";
import {
  summarizeApprovedReports,
  type ApprovedReportsSummary
} from "../lib/approvedReportsSummary";
import type { Report, ReportReviewStatus } from "../types";
import { useItrPeriod } from "./useItrPeriod";

export interface ReportFeedFilters {
  search?: string;
  userId?: string;
  status?: ReportReviewStatus | "all";
  siteContext?: string;
}

export interface ReportFeedAggregates {
  meters: number;
  insulationArea: number;
  joints: number;
  reportsCount: number;
  avgMeters: number;
  bySiteTop: Array<[string, number]>;
  byTypeTop: Array<[string, number]>;
  byAuthorTop: Array<[string, { uid: string; meters: number; reports: number }]>;
  byDay: Array<{ date: string; reports: number; meters: number }>;
  submittedCount: number;
  needsFixCount: number;
  approvedCount: number;
  todayShiftAuthors: string[];
  anomalies: Array<{ reportId: string; reason: string; reportDate: string; userId: string }>;
}

function statusOf(report: Report): ReportReviewStatus {
  return report.status ?? "submitted";
}

export interface ReportFeed {
  rows: Report[];
  rowsAll: Report[];
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number | null;
  totals: ReportFeedAggregates;
  /** Согласованные отчёты за выбранный период (независимо от фильтра статуса в списке). */
  approvedInPeriod: ApprovedReportsSummary;
  refresh: () => void;
}

export function useReportFeed(
  filters: ReportFeedFilters = {},
  options: { autoRefresh?: boolean } = {}
): ReportFeed {
  const autoRefresh = options.autoRefresh ?? true;
  const { range } = useItrPeriod();
  const [rowsAll, setRowsAll] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const deferredSearch = useDeferredValue(filters.search ?? "");

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = subscribeAllReports(
      (next) => {
        setRowsAll(next);
        setError(null);
        setLoading(false);
        setLastUpdatedAt(Date.now());
      },
      (message) => {
        setError(message);
        toast.error(message);
        setLoading(false);
      },
      autoRefresh
    );
    return () => unsub?.();
  }, [autoRefresh, version]);

  const rows = useMemo(() => {
    return rowsAll.filter((r) => {
      if (range.from && r.date < range.from) return false;
      if (range.to && r.date > range.to) return false;
      if (filters.userId && r.userId !== filters.userId) return false;
      if (filters.status && filters.status !== "all" && statusOf(r) !== filters.status) return false;
      if (filters.siteContext) {
        const target = filters.siteContext.toLowerCase();
        const hit = r.pipes.some((p) => (p.siteName || "").toLowerCase().includes(target));
        if (!hit) return false;
      }
      return matchesText(r, deferredSearch);
    });
  }, [rowsAll, range.from, range.to, filters.userId, filters.status, filters.siteContext, deferredSearch]);

  const totals = useMemo<ReportFeedAggregates>(() => {
    const meters = rows.reduce((s, r) => s + getReportTotalLength(r), 0);
    const insulationArea = rows.reduce(
      (sum, r) =>
        sum +
        r.pipes.reduce((acc, p) => {
          const diameterM = (p.diameter || 0) / 1000;
          const lengthM = p.totalLength || 0;
          // Approximate insulated surface area as cylinder side area: pi * d * L
          return acc + Math.PI * diameterM * lengthM;
        }, 0),
      0
    );
    const joints = rows.reduce((s, r) => s + getReportJointsCount(r), 0);
    const byType: Record<string, number> = {};
    const bySite: Record<string, number> = {};
    const byAuthor: Record<string, { uid: string; meters: number; reports: number }> = {};
    const byDay: Record<string, { reports: number; meters: number }> = {};
    let submittedCount = 0;
    let needsFixCount = 0;
    let approvedCount = 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayShiftAuthors = new Set<string>();
    const anomalies: ReportFeedAggregates["anomalies"] = [];

    for (const r of rows) {
      const length = getReportTotalLength(r);
      const status = statusOf(r);
      if (status === "submitted") submittedCount += 1;
      else if (status === "needs_fix") needsFixCount += 1;
      else if (status === "approved") approvedCount += 1;

      const dayKey = r.date;
      const dayEntry = byDay[dayKey] ?? { reports: 0, meters: 0 };
      dayEntry.reports += 1;
      dayEntry.meters += length;
      byDay[dayKey] = dayEntry;

      const authorKey = r.userId;
      const authorEntry = byAuthor[authorKey] ?? { uid: r.userId, meters: 0, reports: 0 };
      authorEntry.meters += length;
      authorEntry.reports += 1;
      byAuthor[authorKey] = authorEntry;

      if (r.date === today) todayShiftAuthors.add(r.userId);

      for (const pipe of r.pipes) {
        bySite[pipe.siteName || "—"] = (bySite[pipe.siteName || "—"] ?? 0) + (pipe.totalLength || 0);
        byType[pipe.insulationType || "—"] =
          (byType[pipe.insulationType || "—"] ?? 0) + (pipe.totalLength || 0);
      }

      // Anomaly detection
      if (r.pipes.length > 0 && length === 0) {
        anomalies.push({ reportId: r.id ?? "", reason: "Нулевая протяжённость", reportDate: r.date, userId: r.userId });
      }
      const totalJointsForReport = getReportJointsCount(r);
      const totalPhotos = r.pipes.reduce((sum, p) => sum + (p.photoUrls?.length ?? 0), 0);
      if (totalJointsForReport > 5 && totalPhotos === 0) {
        anomalies.push({
          reportId: r.id ?? "",
          reason: "Стыков больше 5, фото нет",
          reportDate: r.date,
          userId: r.userId
        });
      }
    }

    const byDayArr = Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, reports: value.reports, meters: value.meters }));

    return {
      meters,
      insulationArea,
      joints,
      reportsCount: rows.length,
      avgMeters: rows.length ? meters / rows.length : 0,
      bySiteTop: Object.entries(bySite)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      byTypeTop: Object.entries(byType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      byAuthorTop: Object.entries(byAuthor)
        .sort((a, b) => b[1].meters - a[1].meters)
        .slice(0, 10),
      byDay: byDayArr,
      submittedCount,
      needsFixCount,
      approvedCount,
      todayShiftAuthors: Array.from(todayShiftAuthors),
      anomalies
    };
  }, [rows]);

  const approvedInPeriod = useMemo(() => {
    const approved = rowsAll.filter((r) => {
      if (statusOf(r) !== "approved") return false;
      if (range.from && r.date < range.from) return false;
      if (range.to && r.date > range.to) return false;
      return true;
    });
    return summarizeApprovedReports(approved);
  }, [rowsAll, range.from, range.to]);

  return {
    rows,
    rowsAll,
    loading,
    error,
    lastUpdatedAt,
    totals,
    approvedInPeriod,
    refresh: () => setVersion((v) => v + 1)
  };
}
