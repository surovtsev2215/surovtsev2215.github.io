import { useNavigate } from "react-router-dom";
import { BarChart3, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { exportExcel, exportPdf } from "../lib/exportReports";
import { useExecutiveReportsState, type PeriodPreset } from "../hooks/useExecutiveReportsState";
import { useState } from "react";
import { toast } from "sonner";

const periodOptions: { label: string; value: PeriodPreset }[] = [
  { label: "Сегодня", value: "today" },
  { label: "7 дней", value: 7 },
  { label: "30 дней", value: 30 },
  { label: "Всё", value: "all" }
];

export function DirectorOverviewPage() {
  const navigate = useNavigate();
  const state = useExecutiveReportsState();
  const [exporting, setExporting] = useState<null | "excel" | "pdf">(null);

  async function handleExport(kind: "excel" | "pdf") {
    setExporting(kind);
    try {
      if (kind === "excel") await exportExcel(state.rows);
      else await exportPdf(state.rows);
      toast.success(`Экспорт в ${kind.toUpperCase()} готов`);
    } catch {
      toast.error("Не удалось выполнить экспорт");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="page-stack">
      <div className="surface-highlight animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Сводка для директора</h2>
            <p className="mt-1 text-sm text-slate-100/90">
              Быстрый обзор по объектам и производственным показателям.
            </p>
          </div>
          <BarChart3 className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      <div className="content-section flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {periodOptions.map((item) => (
            <Button
              key={item.label}
              type="button"
              size="sm"
              className="min-w-[84px]"
              variant={state.preset === item.value ? "default" : "secondary"}
              onClick={() => {
                state.setManualFrom("");
                state.setManualTo("");
                state.setPreset(item.value);
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={state.refresh}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Обновить
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="soft-ring">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Отчётов</div>
            <div className="mt-1 text-2xl font-bold">{state.rows.length}</div>
          </CardContent>
        </Card>
        <Card className="soft-ring">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Протяжённость</div>
            <div className="mt-1 text-2xl font-bold">{state.totals.meters.toFixed(1)} м</div>
          </CardContent>
        </Card>
        <Card className="soft-ring">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Стыков</div>
            <div className="mt-1 text-2xl font-bold">{state.totals.joints}</div>
          </CardContent>
        </Card>
        <Card className="soft-ring">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Средняя длина/отчёт</div>
            <div className="mt-1 text-2xl font-bold">{state.totals.avgMeters.toFixed(1)} м</div>
          </CardContent>
        </Card>
      </div>

      <Card className="soft-ring">
        <CardContent className="space-y-3 p-4">
          <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-200">Топ участков</div>
          {!state.totals.bySiteTop.length ? (
            <div className="text-sm text-slate-500 theme-dark:text-slate-400">Нет данных за выбранный период.</div>
          ) : (
            <div className="space-y-2">
              {state.totals.bySiteTop.slice(0, 5).map(([site, value]) => (
                <button
                  key={site}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100 theme-dark:border-slate-700 theme-dark:bg-slate-800/60 theme-dark:hover:bg-slate-800"
                  onClick={() => navigate(`/director/reports?site=${encodeURIComponent(site)}`)}
                >
                  <span className="truncate">{site}</span>
                  <span className="font-semibold">{value.toFixed(1)} м</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="soft-ring">
        <CardContent className="space-y-2 p-4">
          <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-200">Скачать за период</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              disabled={exporting !== null}
              onClick={() => void handleExport("excel")}
            >
              Excel
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={exporting !== null}
              onClick={() => void handleExport("pdf")}
            >
              PDF
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
