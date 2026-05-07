import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { subscribeAllReports } from "../lib/reportStore";
import { exportExcel, exportPdf } from "../lib/exportReports";
import {
  formatLineNames,
  getReportJointsCount,
  getReportPipeCount,
  getReportTotalLength,
  matchesText
} from "../lib/reportAggregations";
import type { Report } from "../types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [allRows, setAllRows] = useState<Report[]>([]);
  const [listVersion, setListVersion] = useState(0);
  const [exporting, setExporting] = useState<null | "excel" | "pdf">(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const unsub = subscribeAllReports(setAllRows, (msg) => toast.error(msg));
    return () => unsub?.();
  }, [listVersion]);

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      return matchesText(r, deferredSearch);
    });
  }, [allRows, from, to, deferredSearch]);

  const totals = useMemo(() => {
    const meters = rows.reduce((s, r) => s + getReportTotalLength(r), 0);
    const joints = rows.reduce((s, r) => s + getReportJointsCount(r), 0);
    const byType = rows.reduce<Record<string, number>>((acc, r) => {
      for (const p of r.pipes) {
        const key = p.insulationType || "—";
        acc[key] = (acc[key] ?? 0) + (p.totalLength || 0);
      }
      return acc;
    }, {});
    const chart = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const avgMeters = rows.length ? meters / rows.length : 0;
    return { meters, joints, chart, avgMeters };
  }, [rows]);

  function applyRange(days: number | "all") {
    if (days === "all") {
      setFrom("");
      setTo("");
      return;
    }
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - days + 1);
    setTo(now.toISOString().slice(0, 10));
    setFrom(start.toISOString().slice(0, 10));
  }

  async function handleExport(kind: "excel" | "pdf") {
    setExporting(kind);
    try {
      if (kind === "excel") {
        await exportExcel(rows);
      } else {
        await exportPdf(rows);
      }
      toast.success(`Экспорт в ${kind.toUpperCase()} готов`);
    } catch {
      toast.error("Не удалось выполнить экспорт");
    } finally {
      setExporting(null);
    }
  }

  function openReport(r: Report) {
    if (r.id) navigate(`/report/${r.id}`);
  }

  return (
    <div className="page-stack">
      <div className="surface-highlight animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Панель начальника ПТО</h2>
            <p className="mt-1 text-sm text-slate-100/90">Ключевые метрики, фильтры и экспорт отчётности.</p>
          </div>
          <BarChart3 className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>
      <div className="content-section flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-title text-sm uppercase tracking-wide">
          Управление данными
        </h3>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setListVersion((v) => v + 1)}
          aria-label="Обновить список"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Обновить
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="soft-ring kpi-glow animate-in-up">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Всего отчетов</div>
            <div className="mt-1 text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card className="soft-ring kpi-glow animate-in-up">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Общая протяженность</div>
            <div className="mt-1 text-2xl font-bold">{totals.meters.toFixed(1)} м</div>
          </CardContent>
        </Card>
        <Card className="soft-ring kpi-glow animate-in-up">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Всего стыков</div>
            <div className="mt-1 text-2xl font-bold">{totals.joints}</div>
          </CardContent>
        </Card>
        <Card className="soft-ring kpi-glow animate-in-up">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Средняя длина/отчёт</div>
            <div className="mt-1 text-2xl font-bold">{totals.avgMeters.toFixed(1)} м</div>
          </CardContent>
        </Card>
      </div>

      <div className="glass-toolbar animate-in-up">
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            className="md:col-span-1"
            placeholder="Поиск: блок, линия, тип изоляции"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск по блоку, линии или типу изоляции"
          />
          <Input className="md:col-span-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Дата с" />
          <Input className="md:col-span-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Дата по" />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={exporting !== null}
              onClick={() => void handleExport("excel")}
            >
              Excel
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={exporting !== null}
              onClick={() => void handleExport("pdf")}
            >
              PDF
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" className="flex-1 sm:flex-none" onClick={() => applyRange(7)}>
            7 дней
          </Button>
          <Button type="button" size="sm" variant="secondary" className="flex-1 sm:flex-none" onClick={() => applyRange(30)}>
            30 дней
          </Button>
          <Button type="button" size="sm" variant="secondary" className="flex-1 sm:flex-none" onClick={() => applyRange("all")}>
            Всё время
          </Button>
          <span className="text-xs text-slate-500 theme-dark:text-slate-400">
            После фильтра: {rows.length} отчётов
          </span>
        </div>
      </div>

      {!!totals.chart.length && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 text-sm font-semibold text-slate-700 theme-dark:text-slate-200">
              Распределение по типам изоляции
            </div>
            <div className="space-y-2">
              {totals.chart.map(([name, value]) => {
                const max = totals.chart[0][1] || 1;
                const w = Math.max(6, Math.round((value / max) * 100));
                return (
                  <div key={name} className="grid grid-cols-[1fr_70px] items-center gap-2">
                    <div>
                      <div className="mb-1 flex justify-between text-xs text-slate-600 theme-dark:text-slate-300">
                        <span className="truncate">{name}</span>
                        <span>{value.toFixed(1)} м</span>
                      </div>
                      <div className="h-2 rounded bg-slate-100 theme-dark:bg-slate-800">
                        <div className="h-2 rounded bg-primary theme-dark:bg-accent" style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!rows.length ? (
        <Card className="soft-ring">
          <CardContent className="p-6 text-sm text-slate-600 theme-dark:text-slate-300">
            По выбранным фильтрам пока нет данных.
          </CardContent>
        </Card>
      ) : (
        <>
      <div className="md:hidden">
        <div className="space-y-2">
          {rows.map((r) => {
            const total = getReportTotalLength(r);
            const pipeCount = getReportPipeCount(r);
            return (
              <Card
                key={r.id ?? r.createdAt}
                role="button"
                tabIndex={0}
                className="surface-table-row-interactive cursor-pointer"
                onClick={() => openReport(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openReport(r);
                  }
                }}
              >
                <CardContent className="p-3 text-sm">
                  <div className="font-medium">{formatLineNames(r)}</div>
                  <div className="text-xs text-slate-500 theme-dark:text-slate-400">{r.date}</div>
                  <div className="mt-1 text-slate-600 theme-dark:text-slate-300">
                    Блок {r.fullName || "—"} · {pipeCount} {pipeCount === 1 ? "труба" : "труб(ы)"} · Σ {total.toFixed(1)} м
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="surface-card animate-in-up hidden overflow-x-auto rounded-xl md:block">
        <div className="min-w-[640px]">
          <div className="surface-table-header grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold">
            <div className="col-span-2">Дата</div>
            <div className="col-span-2">Блок</div>
            <div className="col-span-5">Линии трубопровода</div>
            <div className="col-span-1 text-right">Труб</div>
            <div className="col-span-2 text-right">Σ длина</div>
          </div>
          {rows.map((r) => {
            const total = getReportTotalLength(r);
            const pipeCount = getReportPipeCount(r);
            return (
              <div
                key={r.id ?? r.createdAt}
                role="button"
                tabIndex={0}
                className="surface-table-row surface-table-row-interactive grid grid-cols-12 gap-2 px-3 py-2 text-sm last:border-b-0"
                onClick={() => openReport(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openReport(r);
                  }
                }}
              >
                <div className="col-span-2">{r.date}</div>
                <div className="col-span-2">{r.fullName || "—"}</div>
                <div className="col-span-5 truncate">{formatLineNames(r)}</div>
                <div className="col-span-1 text-right">{pipeCount}</div>
                <div className="col-span-2 text-right">{total.toFixed(1)} м</div>
              </div>
            );
          })}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
