import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { subscribeAllReports } from "../lib/reportStore";
import {
  getReportJointsCount,
  getReportTotalLength,
  matchesText
} from "../lib/reportAggregations";
import type { Report } from "../types";

export type PeriodPreset = "today" | 7 | 30 | "all";
const DIRECTOR_PERIOD_KEY = "pto-director-period-v1";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function rangeFromPreset(preset: PeriodPreset): { from: string; to: string } {
  if (preset === "all") return { from: "", to: "" };
  const to = todayStr();
  const start = new Date();
  if (preset === "today") return { from: to, to };
  start.setDate(start.getDate() - preset + 1);
  return { from: start.toISOString().slice(0, 10), to };
}

function loadPreset(): PeriodPreset {
  const raw = sessionStorage.getItem(DIRECTOR_PERIOD_KEY);
  if (raw === "today" || raw === "all" || raw === "7" || raw === "30") {
    return raw === "7" ? 7 : raw === "30" ? 30 : raw;
  }
  return 7;
}

export function useExecutiveReportsState() {
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<PeriodPreset>(() => loadPreset());
  const [manualFrom, setManualFrom] = useState("");
  const [manualTo, setManualTo] = useState("");
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    sessionStorage.setItem(DIRECTOR_PERIOD_KEY, String(preset));
  }, [preset]);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeAllReports(
      (next) => {
        setRows(next);
        setLoading(false);
      },
      (message) => {
        toast.error(message);
        setLoading(false);
      }
    );
    return () => unsub?.();
  }, [version]);

  const dateRange = useMemo(() => {
    if (manualFrom || manualTo) return { from: manualFrom, to: manualTo };
    return rangeFromPreset(preset);
  }, [manualFrom, manualTo, preset]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (dateRange.from && r.date < dateRange.from) return false;
      if (dateRange.to && r.date > dateRange.to) return false;
      return matchesText(r, deferredSearch);
    });
  }, [rows, dateRange.from, dateRange.to, deferredSearch]);

  const totals = useMemo(() => {
    const meters = filteredRows.reduce((s, r) => s + getReportTotalLength(r), 0);
    const joints = filteredRows.reduce((s, r) => s + getReportJointsCount(r), 0);
    const byType = filteredRows.reduce<Record<string, number>>((acc, r) => {
      for (const p of r.pipes) {
        const key = p.insulationType || "—";
        acc[key] = (acc[key] ?? 0) + (p.totalLength || 0);
      }
      return acc;
    }, {});
    const bySite = filteredRows.reduce<Record<string, number>>((acc, r) => {
      for (const p of r.pipes) {
        const key = p.siteName || "—";
        acc[key] = (acc[key] ?? 0) + (p.totalLength || 0);
      }
      return acc;
    }, {});
    return {
      meters,
      joints,
      avgMeters: filteredRows.length ? meters / filteredRows.length : 0,
      byTypeTop: Object.entries(byType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      bySiteTop: Object.entries(bySite)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }, [filteredRows]);

  return {
    rows: filteredRows,
    loading,
    search,
    setSearch,
    preset,
    setPreset,
    manualFrom,
    setManualFrom,
    manualTo,
    setManualTo,
    dateRange,
    totals,
    refresh: () => setVersion((v) => v + 1)
  };
}
