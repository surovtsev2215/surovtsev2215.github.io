import { useDeferredValue, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Download, ListFilter, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useReportFeed } from "../hooks/useReportFeed";
import { useItrPeriod } from "../hooks/useItrPeriod";
import { useUsersDirectory } from "../hooks/useUsersDirectory";
import {
  formatLineNames,
  getReportPipeCount,
  getReportTotalLength
} from "../lib/reportAggregations";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";
import { exportExcel, exportPdf } from "../lib/exportReports";
import { PeriodSwitcher } from "../components/itr/PeriodSwitcher";
import type { ReportReviewStatus } from "../types";

const STATUS_LABELS: Record<ReportReviewStatus, string> = {
  submitted: "На согласование",
  approved: "Согласован",
  needs_fix: "На доработку"
};

function StatusBadge({ status }: { status: ReportReviewStatus }) {
  const cls =
    status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 theme-dark:border-emerald-800 theme-dark:bg-emerald-950/40 theme-dark:text-emerald-300"
      : status === "needs_fix"
        ? "border-amber-200 bg-amber-50 text-amber-700 theme-dark:border-amber-800 theme-dark:bg-amber-950/40 theme-dark:text-amber-300"
        : "border-sky-200 bg-sky-50 text-sky-700 theme-dark:border-sky-800 theme-dark:bg-sky-950/40 theme-dark:text-sky-300";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function DirectorReportsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const usersDirectory = useUsersDirectory();
  const { preset, setPreset } = useItrPeriod();
  const [exporting, setExporting] = useState<null | "excel" | "pdf">(null);

  const userFilter = searchParams.get("user") ?? "";
  const statusFilter = (searchParams.get("status") as ReportReviewStatus | "all" | null) ?? "all";
  const siteFromUrl = searchParams.get("site") ?? "";
  const queryFromUrl = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(queryFromUrl || siteFromUrl);
  const deferredSearch = useDeferredValue(search);

  const reports = useReportFeed({
    search: deferredSearch,
    userId: userFilter || undefined,
    status: statusFilter === "all" ? "all" : (statusFilter as ReportReviewStatus)
  });

  const rows = reports.rows;

  const setParam = (key: string, value?: string) => {
    const params = new URLSearchParams(searchParams);
    if (value && value.length) params.set(key, value);
    else params.delete(key);
    setSearchParams(params, { replace: true });
  };

  const clearAllFilters = () => {
    setSearch("");
    setPreset("all");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const userChip = userFilter ? usersDirectory.byUid(userFilter) : undefined;

  const activeChips: Array<{ id: string; label: string; clear: () => void }> = useMemo(() => {
    const chips: Array<{ id: string; label: string; clear: () => void }> = [];
    if (search.trim()) {
      chips.push({ id: "q", label: `Поиск: ${search.trim()}`, clear: () => {
        setSearch("");
        setParam("q");
      } });
    }
    if (siteFromUrl) {
      chips.push({ id: "site", label: `Объект: ${siteFromUrl}`, clear: () => setParam("site") });
    }
    if (userFilter) {
      chips.push({
        id: "user",
        label: `Автор: ${userChip?.fullName ? formatFullNameForDisplay(userChip.fullName) : userFilter}`,
        clear: () => setParam("user")
      });
    }
    if (statusFilter !== "all") {
      chips.push({
        id: "status",
        label: `Статус: ${STATUS_LABELS[statusFilter as ReportReviewStatus]}`,
        clear: () => setParam("status")
      });
    }
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, siteFromUrl, userFilter, statusFilter, userChip]);

  async function handleExport(kind: "excel" | "pdf") {
    setExporting(kind);
    try {
      if (kind === "excel") await exportExcel(rows);
      else await exportPdf(rows);
      toast.success(`Экспорт в ${kind.toUpperCase()} готов`);
    } catch {
      toast.error("Не удалось выполнить экспорт");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="page-stack">
      <div className="surface-highlight surface-hero-light animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Отчёты компании</h2>
            <p className="mt-1 text-sm text-slate-100/90">
              Поиск, фильтрация и быстрый переход в карточку отчёта.
            </p>
          </div>
          <ListFilter className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      <div className="glass-toolbar surface-floating itr-panel itr-priority-info space-y-2">
        <div className="flex items-center justify-between">
          <span className="itr-chip">Фильтры отчётов</span>
        </div>
        <Input
          placeholder="Поиск: блок, линия, тип изоляции"
          value={search}
          onChange={(e) => {
            const next = e.target.value;
            setSearch(next);
            setParam("q", next.trim() || undefined);
          }}
          aria-label="Поиск по блоку, линии или типу изоляции"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={statusFilter === "submitted" ? "default" : "secondary"} size="sm" onClick={() => setParam("status", "submitted")}>
            На согласовании
          </Button>
          <Button type="button" variant={statusFilter === "needs_fix" ? "default" : "secondary"} size="sm" onClick={() => setParam("status", "needs_fix")}>
            На доработку
          </Button>
          <Button type="button" variant={statusFilter === "approved" ? "default" : "secondary"} size="sm" onClick={() => setParam("status", "approved")}>
            Согласованные
          </Button>
          <Button type="button" variant={preset === "today" ? "default" : "secondary"} size="sm" onClick={() => setPreset("today")}>
            За сегодня
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearAllFilters}>
            Сбросить всё
          </Button>
        </div>
        <div className="responsive-toolbar-controls sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          <PeriodSwitcher preset={preset} onChange={setPreset} />
          <Button type="button" variant="secondary" size="sm" disabled={exporting !== null} onClick={() => void handleExport("excel")}>
            <Download className="h-4 w-4" aria-hidden /> Excel
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={exporting !== null} onClick={() => void handleExport("pdf")}>
            PDF
          </Button>
        </div>
        {activeChips.length > 0 && (
          <div className="responsive-chip-wrap">
            {activeChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] shadow-sm hover:bg-slate-100 theme-dark:border-slate-700 theme-dark:bg-slate-800/70 theme-dark:hover:bg-slate-800"
                onClick={chip.clear}
              >
                <span className="responsive-truncate">{chip.label}</span>
                <X className="h-3 w-3" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </div>

      {reports.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : !rows.length ? (
        <Card className="soft-ring surface-floating">
          <CardContent className="space-y-2 p-4 text-sm">
            <p className="text-slate-600 theme-dark:text-slate-300">По текущим фильтрам отчётов не найдено.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setSearch("")}>
                Сбросить поиск
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPreset("all")}
              >
                Показать всё время
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={clearAllFilters}>
                Очистить фильтры
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const total = getReportTotalLength(r);
            const pipeCount = getReportPipeCount(r);
            const author = usersDirectory.byUid(r.userId);
            const status = (r.status ?? "submitted") as ReportReviewStatus;
            return (
              <Card
                key={r.id ?? r.createdAt}
                role="button"
                tabIndex={0}
                className="surface-table-row-interactive cursor-pointer"
                onClick={() =>
                  r.id &&
                  navigate(`/report/${r.id}`, {
                    state: { directorBackTo: `/director/reports${location.search}` }
                  })
                }
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && r.id) {
                    e.preventDefault();
                    navigate(`/report/${r.id}`, {
                      state: { directorBackTo: `/director/reports${location.search}` }
                    });
                  }
                }}
              >
                <CardContent className="p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="responsive-truncate font-medium">{formatLineNames(r)}</div>
                      <div className="text-xs text-slate-500 theme-dark:text-slate-400">
                        {r.date} · {author?.fullName ? formatFullNameForDisplay(author.fullName) : r.userEmail}
                        {author?.position ? ` · ${author.position}` : ""}
                      </div>
                    </div>
                    <StatusBadge status={status} />
                  </div>
                  <div className="mt-1 text-slate-600 theme-dark:text-slate-300">
                    Блок {r.fullName || "—"} · {pipeCount} {pipeCount === 1 ? "труба" : "труб(ы)"} · Σ {total.toFixed(1)} м
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
