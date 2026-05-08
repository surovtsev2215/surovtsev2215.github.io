import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useReportFeed } from "../hooks/useReportFeed";
import { useUsersDirectory } from "../hooks/useUsersDirectory";
import { useItrPeriod } from "../hooks/useItrPeriod";
import { isApiConfigured } from "../lib/runtimeConfig";
import { submitReportReview } from "../lib/reviewApi";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { PeriodSwitcher } from "../components/itr/PeriodSwitcher";
import {
  formatLineNames,
  getReportPipeCount,
  getReportTotalLength
} from "../lib/reportAggregations";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";
import { cn } from "../lib/utils";

const HOURS_TO_OVERDUE = 48;

function isOverdue(createdAt: number): boolean {
  const ageH = (Date.now() - createdAt) / (1000 * 60 * 60);
  return ageH > HOURS_TO_OVERDUE;
}

export function DirectorApprovalsPage() {
  const navigate = useNavigate();
  const usersDirectory = useUsersDirectory();
  const reports = useReportFeed({ status: "submitted" });
  const { preset, setPreset } = useItrPeriod();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const rows = useMemo(
    () => reports.rows.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [reports.rows]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(rows.map((r) => r.id ?? "").filter(Boolean)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function bulkApprove() {
    if (selected.size === 0) {
      toast.error("Выберите хотя бы один отчёт.");
      return;
    }
    setSubmitting(true);
    try {
      let ok = 0;
      for (const id of selected) {
        try {
          await submitReportReview(id, "approved");
          ok += 1;
        } catch {
          /* noop */
        }
      }
      toast.success(`Согласовано: ${ok} из ${selected.size}`);
      clearSelection();
      reports.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!isApiConfigured) {
    return (
      <div className="page-stack">
        <div className="surface-highlight surface-hero-light animate-in-up p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Согласование</h2>
              <p className="mt-1 text-sm text-slate-100/90">Доступно только в локальной версии.</p>
            </div>
            <ShieldCheck className="h-5 w-5 shrink-0 text-amber-300" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="surface-highlight surface-hero-light animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Согласование</h2>
            <p className="mt-1 text-sm text-slate-100/90">
              Отчёты, ожидающие вашего решения. Просрочкой считается ожидание дольше {HOURS_TO_OVERDUE} ч.
            </p>
          </div>
          <ShieldCheck className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      <div className="glass-toolbar itr-panel itr-priority-warn space-y-2">
        <div className="flex items-center justify-between">
          <span className="itr-chip">Панель согласования</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PeriodSwitcher preset={preset} onChange={setPreset} />
          <div className="text-xs text-slate-500 theme-dark:text-slate-400">
            Всего на согласование: {reports.totals.submittedCount}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={rows.length === 0}
            onClick={selectAll}
          >
            Выбрать всё
          </Button>
          {selected.size > 0 && (
            <>
              <Button type="button" size="sm" variant="secondary" onClick={clearSelection}>
                Снять выбор ({selected.size})
              </Button>
              <Button type="button" size="sm" disabled={submitting} onClick={() => void bulkApprove()}>
                {submitting ? "Сохранение…" : `Согласовать выбранные (${selected.size})`}
              </Button>
            </>
          )}
        </div>
      </div>

      {reports.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="soft-ring itr-panel itr-priority-success">
          <CardContent className="p-4 text-sm text-slate-600 theme-dark:text-slate-300">
            Нет отчётов на согласование. Хорошая работа.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const overdue = isOverdue(r.createdAt);
            const author = usersDirectory.byUid(r.userId);
            const totalLen = getReportTotalLength(r);
            const pipeCount = getReportPipeCount(r);
            const isSelected = r.id ? selected.has(r.id) : false;
            return (
              <Card
                key={r.id ?? r.createdAt}
                className={cn(
                  "soft-ring itr-panel",
                  overdue ? "ring-1 ring-amber-300 theme-dark:ring-amber-700" : "",
                  isSelected ? "outline outline-2 outline-primary/70" : ""
                )}
              >
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <label className="flex min-w-0 cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={isSelected}
                        onChange={() => r.id && toggle(r.id)}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{formatLineNames(r)}</div>
                        <div className="text-[11px] text-slate-500 theme-dark:text-slate-400">
                          {r.date} · {author?.fullName ? formatFullNameForDisplay(author.fullName) : r.userEmail}
                          {author?.position ? ` · ${author.position}` : ""}
                        </div>
                      </div>
                    </label>
                    {overdue && (
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 theme-dark:border-amber-800 theme-dark:bg-amber-950/40 theme-dark:text-amber-300">
                        Просрочено
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 theme-dark:text-slate-300">
                    <span>
                      Блок {r.fullName || "—"} · {pipeCount} {pipeCount === 1 ? "труба" : "труб(ы)"} · Σ {totalLen.toFixed(1)} м
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        r.id &&
                        navigate(`/report/${r.id}`, {
                          state: { directorBackTo: "/director/approvals" }
                        })
                      }
                    >
                      Открыть
                    </Button>
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
