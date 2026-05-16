import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { deleteReport, subscribeReportsByUser } from "../lib/reportStore";
import { canDeleteReport, canEditReport, getReportStatus } from "../lib/reportPermissions";
import { ReportReviewNotice } from "../components/reports/ReportReviewNotice";
import { ReportStatusBadge } from "../components/reports/ReportStatusBadge";
import {
  formatLineNames,
  getReportPipeCount,
  getReportTotalLength,
  matchesText
} from "../lib/reportAggregations";
import { collectUniqueCrewFromReport, formatCrewLine } from "../lib/brigade";
import type { Report } from "../types";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "../components/feedback/AsyncState";
import { FilterPanel } from "../components/layout/FilterPanel";

export function HistoryPage() {
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rows, setRows] = useState<Report[]>([]);
  const [listVersion, setListVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "length">("date");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  const filteredRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      // Extra safety guard: show only current employee reports
      // even if source list contains mixed records.
      if (profile?.uid && r.userId !== profile.uid) return false;
      if (profile?.email && r.userEmail !== profile.email) return false;
      if (fromDate && r.date < fromDate) return false;
      if (toDate && r.date > toDate) return false;
      return matchesText(r, deferredSearch);
    });
    return filtered.sort((a, b) => {
      const direction = sortDir === "asc" ? 1 : -1;
      if (sortBy === "length") {
        return (getReportTotalLength(a) - getReportTotalLength(b)) * direction;
      }
      return (a.date.localeCompare(b.date) || a.createdAt - b.createdAt) * direction;
    });
  }, [rows, profile?.uid, profile?.email, deferredSearch, fromDate, toDate, sortBy, sortDir]);

  const stats = useMemo(() => {
    const meters = filteredRows.reduce((sum, item) => sum + getReportTotalLength(item), 0);
    return { count: filteredRows.length, meters };
  }, [filteredRows]);

  function applyRange(days: number | "all") {
    if (days === "all") {
      setFromDate("");
      setToDate("");
      return;
    }
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - days + 1);
    setToDate(now.toISOString().slice(0, 10));
    setFromDate(from.toISOString().slice(0, 10));
  }

  function resetFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setSortBy("date");
    setSortDir("desc");
  }

  async function handleDeleteReport(report: Report, e: React.MouseEvent) {
    e.stopPropagation();
    if (!report.id || !canDeleteReport(report, profile?.uid, role)) return;
    const ok = window.confirm(
      `Удалить отчёт за ${report.date}? Это действие нельзя отменить.`
    );
    if (!ok) return;
    setDeletingId(report.id);
    try {
      await deleteReport(report.id);
      toast.success("Отчёт удалён");
      setListVersion((v) => v + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить отчёт");
    } finally {
      setDeletingId(null);
    }
  }

  function openEdit(report: Report, e: React.MouseEvent) {
    e.stopPropagation();
    if (!report.id || !canEditReport(report, profile?.uid, role)) return;
    navigate(`/form?edit=${encodeURIComponent(report.id)}`);
  }

  useEffect(() => {
    if (!profile?.uid) return;
    setLoading(true);
    setError(null);
    const unsub = subscribeReportsByUser(
      profile.uid,
      (next) => {
        setRows(next);
        setLoading(false);
        setError(null);
      },
      (msg) => {
        toast.error(msg);
        setError(msg);
        setLoading(false);
      }
    );
    return () => unsub?.();
  }, [profile?.uid, listVersion]);

  return (
    <div className="page-stack">
      <div className="surface-highlight animate-in-up mb-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">История отчётов</h2>
            <p className="mt-1 text-sm text-slate-100/90">Быстрый доступ к отправленным записям и фильтрам.</p>
          </div>
          <Clock3 className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>
      <FilterPanel
        actions={
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
        }
      >
        <div className="filter-field-grid">
          <Input
            placeholder="Поиск: линия, тип изоляции, блок"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск по отчетам"
          />
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label="Дата от"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label="Дата до"
          />
        </div>
        <div className="filter-btn-row">
          <Button type="button" variant="secondary" size="sm" className="flex-1 sm:flex-none" onClick={() => applyRange(7)}>
            7 дней
          </Button>
          <Button type="button" variant="secondary" size="sm" className="flex-1 sm:flex-none" onClick={() => applyRange(30)}>
            30 дней
          </Button>
          <Button type="button" variant="secondary" size="sm" className="flex-1 sm:flex-none" onClick={() => applyRange("all")}>
            Всё
          </Button>
          <Button type="button" variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={resetFilters}>
            Сбросить фильтры
          </Button>
          <select
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm sm:h-9 sm:w-auto theme-dark:border-slate-700 theme-dark:bg-slate-900"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "date" | "length")}
            aria-label="Сортировать по"
          >
            <option value="date">По дате</option>
            <option value="length">По длине</option>
          </select>
          <select
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm sm:h-9 sm:w-auto theme-dark:border-slate-700 theme-dark:bg-slate-900"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as "desc" | "asc")}
            aria-label="Порядок сортировки"
          >
            <option value="desc">Сначала новые/больше</option>
            <option value="asc">Сначала старые/меньше</option>
          </select>
          <span className="w-full text-xs text-slate-500 sm:ml-auto sm:w-auto theme-dark:text-slate-400">
            Найдено: {stats.count} · {stats.meters.toFixed(1)} м
          </span>
        </div>
      </FilterPanel>
      {loading ? (
        <LoadingState label="Загружаем историю отчётов..." />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => setListVersion((v) => v + 1)}
          retryLabel="Обновить историю"
        />
      ) : !rows.length ? (
        <EmptyState
          title="Пока нет сохранённых отчётов."
          description="Создайте первый отчёт или повторите загрузку списка."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => navigate("/form")}>
                Создать первый отчёт
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setListVersion((v) => v + 1)}>
                Проверить снова
              </Button>
            </div>
          }
        />
      ) : !filteredRows.length ? (
        <EmptyState
          title="По заданным фильтрам ничего не найдено."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={resetFilters}>
                Сбросить фильтры
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-2 animate-in-up">
          {filteredRows.map((r) => {
            const pipeCount = getReportPipeCount(r);
            const totalLen = getReportTotalLength(r);
            const status = getReportStatus(r);
            const editable = canEditReport(r, profile?.uid, role);
            const deletable = canDeleteReport(r, profile?.uid, role);
            return (
              <Card
                key={r.id ?? r.createdAt}
                role="button"
                tabIndex={0}
                className="clickable-card surface-table-row-interactive"
                onClick={() => r.id && navigate(`/report/${r.id}`)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && r.id) {
                    e.preventDefault();
                    navigate(`/report/${r.id}`);
                  }
                }}
              >
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{formatLineNames(r)}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ReportStatusBadge status={status} />
                      <span className="text-sm text-slate-500 theme-dark:text-slate-400">{r.date}</span>
                    </div>
                  </div>
                  <div className="text-sm text-slate-600 theme-dark:text-slate-300">
                    Блок {r.fullName || "—"} · {pipeCount} {pipeCount === 1 ? "труба" : "труб(ы)"} · Σ {totalLen.toFixed(1)} м
                    {r.isBrigadeReport ? " · отчёт бригады" : ""}
                  {formatCrewLine(collectUniqueCrewFromReport(r)) ? (
                    <p className="mt-0.5 text-xs text-slate-500 theme-dark:text-slate-400">
                      Участники: {formatCrewLine(collectUniqueCrewFromReport(r))}
                    </p>
                  ) : null}
                  </div>
                  {status === "needs_fix" ? (
                    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <ReportReviewNotice report={r} compact />
                    </div>
                  ) : null}
                  {(editable || deletable) && (
                    <div
                      className="flex flex-wrap gap-2 border-t border-slate-200/80 pt-2 theme-dark:border-slate-700/80"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {editable ? (
                        <Button type="button" variant="secondary" size="sm" onClick={(e) => openEdit(r, e)}>
                          <Pencil className="h-4 w-4" aria-hidden />
                          Изменить
                        </Button>
                      ) : null}
                      {deletable ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={deletingId === r.id}
                          onClick={(e) => void handleDeleteReport(r, e)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          {deletingId === r.id ? "Удаление…" : "Удалить"}
                        </Button>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
