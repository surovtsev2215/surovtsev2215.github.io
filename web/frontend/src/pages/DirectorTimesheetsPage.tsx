import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Download, Save, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Skeleton } from "../components/ui/skeleton";
import { EmptyState, ErrorState } from "../components/feedback/AsyncState";
import { FilterPanel } from "../components/layout/FilterPanel";
import { PeriodSwitcher } from "../components/itr/PeriodSwitcher";
import { useReportFeed } from "../hooks/useReportFeed";
import { useItrPeriod } from "../hooks/useItrPeriod";
import { useUsersDirectory } from "../hooks/useUsersDirectory";
import { formatItrPeriodLabel } from "../lib/approvedReportsSummary";
import { exportTimesheetsExcel } from "../lib/exportTimesheets";
import {
  buildTimesheetsFromReports,
  formatRub,
  type InsulatorTimesheet
} from "../lib/timesheetCalc";
import { fetchWorkRates, saveWorkRates } from "../lib/workRatesApi";
import {
  DEFAULT_WORK_RATES,
  WORK_RATE_KEYS,
  WORK_RATE_LABELS,
  type WorkRateKey,
  type WorkRates
} from "../lib/workRates";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";

type PageTab = "timesheets" | "rates";

function TimesheetRowCard({
  sheet,
  expanded,
  onToggle
}: {
  sheet: InsulatorTimesheet;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="soft-ring surface-floating overflow-hidden">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 p-3 text-left sm:p-4"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 theme-dark:text-slate-50">
            {formatFullNameForDisplay(sheet.fullName)}
          </div>
          {sheet.position ? (
            <p className="text-xs text-slate-500 theme-dark:text-slate-400">{sheet.position}</p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500 theme-dark:text-slate-400">
            Отчётов: {sheet.reportIds.length}
            {sheet.quantities.pipelineMountM2 > 0 ? ` · ТИ ${sheet.quantities.pipelineMountM2} м²` : ""}
            {sheet.quantities.foilPm > 0 ? ` · фольга ${sheet.quantities.foilPm} п.м.` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-emerald-700 theme-dark:text-emerald-300">
            {formatRub(sheet.amounts.total)}
          </div>
          <p className="text-[10px] text-slate-500">{expanded ? "Свернуть" : "Детализация"}</p>
        </div>
      </button>
      {expanded ? (
        <CardContent className="border-t border-slate-200/80 pt-3 theme-dark:border-slate-700/80">
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {sheet.quantities.shiftDays > 0 ? (
              <div className="rounded-lg bg-amber-50/80 px-2 py-1.5 theme-dark:bg-amber-950/30">
                Смен: {sheet.quantities.shiftDays} · {formatRub(sheet.amounts.shiftDay)}
              </div>
            ) : null}
            {sheet.quantities.shiftMoneySum > 0 ? (
              <div className="rounded-lg bg-amber-50/80 px-2 py-1.5 theme-dark:bg-amber-950/30">
                Сумма смен: {formatRub(sheet.quantities.shiftMoneySum)} · {formatRub(sheet.amounts.shiftMoney)}
              </div>
            ) : null}
            {sheet.quantities.pipelineMountM2 > 0 ? (
              <div className="rounded-lg bg-sky-50/80 px-2 py-1.5 theme-dark:bg-sky-950/30">
                Трубы: {sheet.quantities.pipelineMountM2} м² · {formatRub(sheet.amounts.pipeline)}
              </div>
            ) : null}
            {sheet.quantities.equipmentMountM2 > 0 ? (
              <div className="rounded-lg bg-emerald-50/80 px-2 py-1.5 theme-dark:bg-emerald-950/30">
                Оборуд.: {sheet.quantities.equipmentMountM2} м² · {formatRub(sheet.amounts.equipment)}
              </div>
            ) : null}
            {sheet.quantities.demountM2 > 0 ? (
              <div className="rounded-lg bg-rose-50/80 px-2 py-1.5 theme-dark:bg-rose-950/30">
                Демонтаж: {sheet.quantities.demountM2} м² · {formatRub(sheet.amounts.demount)}
              </div>
            ) : null}
            {sheet.quantities.foilPm > 0 ? (
              <div className="rounded-lg bg-amber-50/80 px-2 py-1.5 theme-dark:bg-amber-950/30">
                Фольга: {sheet.quantities.foilPm} п.м. · {formatRub(sheet.amounts.foil)}
              </div>
            ) : null}
          </div>
          <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 theme-dark:border-slate-700">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 theme-dark:bg-slate-800 theme-dark:text-slate-300">
                <tr>
                  <th className="px-2 py-1.5">Дата</th>
                  <th className="px-2 py-1.5">Описание</th>
                  <th className="px-2 py-1.5 text-right">Кол-во</th>
                  <th className="px-2 py-1.5 text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {sheet.lines.map((line, i) => (
                  <tr key={`${line.reportId}-${i}`} className="border-t border-slate-100 theme-dark:border-slate-800">
                    <td className="whitespace-nowrap px-2 py-1.5">{line.reportDate}</td>
                    <td className="px-2 py-1.5">{line.description}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      {line.quantity} {line.unit}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium">
                      {formatRub(line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function DirectorTimesheetsPage() {
  const { preset, setPreset, range } = useItrPeriod();
  const usersDirectory = useUsersDirectory();
  const [tab, setTab] = useState<PageTab>("timesheets");
  const [onlyApproved, setOnlyApproved] = useState(true);
  const [rates, setRates] = useState<WorkRates>({ ...DEFAULT_WORK_RATES });
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const reportsFeed = useReportFeed({
    status: onlyApproved ? "approved" : "all"
  });

  useEffect(() => {
    let cancelled = false;
    setRatesLoading(true);
    void (async () => {
      try {
        const loaded = await fetchWorkRates();
        if (!cancelled) setRates(loaded);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Не удалось загрузить расценки");
      } finally {
        if (!cancelled) setRatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const periodLabel = formatItrPeriodLabel(preset, range);

  const timesheets = useMemo(
    () => buildTimesheetsFromReports(reportsFeed.rows, rates, { onlyApproved }),
    [reportsFeed.rows, rates, onlyApproved]
  );

  const filteredSheets = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return timesheets;
    return timesheets.filter((s) => {
      const name = s.fullName.toLowerCase();
      const user = usersDirectory.byUid(s.uid);
      const pos = (user?.position || s.position || "").toLowerCase();
      return name.includes(q) || pos.includes(q);
    });
  }, [timesheets, deferredSearch, usersDirectory]);

  const grandTotal = useMemo(
    () => filteredSheets.reduce((sum, s) => sum + s.amounts.total, 0),
    [filteredSheets]
  );

  const ratesConfigured = WORK_RATE_KEYS.some((k) => rates[k] > 0);

  async function handleSaveRates() {
    setRatesSaving(true);
    try {
      const saved = await saveWorkRates(rates);
      setRates(saved);
      toast.success("Расценки сохранены");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить расценки");
    } finally {
      setRatesSaving(false);
    }
  }

  async function handleExport() {
    if (!filteredSheets.length) {
      toast.error("Нет данных для выгрузки.");
      return;
    }
    setExporting(true);
    try {
      await exportTimesheetsExcel(filteredSheets, periodLabel);
      toast.success("Табель выгружен в Excel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось выгрузить табель");
    } finally {
      setExporting(false);
    }
  }

  function updateRate(key: WorkRateKey, value: string) {
    const n = Number(value.replace(",", "."));
    setRates((prev) => ({
      ...prev,
      [key]: Number.isFinite(n) && n >= 0 ? n : 0
    }));
  }

  return (
    <div className="page-stack">
      <div className="surface-highlight animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Табеля</h2>
            <p className="mt-1 text-sm text-slate-100/90">
              Начисления изолировщикам по согласованным отчётам и вашим расценкам
            </p>
          </div>
          <Table2 className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "timesheets" ? "default" : "secondary"}
          onClick={() => setTab("timesheets")}
        >
          Табеля
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "rates" ? "default" : "secondary"}
          onClick={() => setTab("rates")}
        >
          Расценки
        </Button>
      </div>

      {tab === "rates" ? (
        <Card className="soft-ring surface-floating border-violet-200/60 theme-dark:border-violet-900/50">
          <CardContent className="space-y-4 p-4">
            <div>
              <h3 className="font-semibold">Расценки на работы</h3>
              <p className="mt-1 text-sm text-slate-600 theme-dark:text-slate-300">
                Укажите ставки в рублях. Табель пересчитается автоматически. Работы бригады делятся
                поровну между участниками карточки.
              </p>
              {rates.updatedAt ? (
                <p className="mt-1 text-xs text-slate-500">
                  Обновлено: {new Date(rates.updatedAt).toLocaleString("ru-RU")}
                </p>
              ) : null}
            </div>
            {ratesLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {WORK_RATE_KEYS.map((key) => {
                  const meta = WORK_RATE_LABELS[key];
                  return (
                    <div key={key} className="space-y-1 rounded-xl border border-slate-200 p-3 theme-dark:border-slate-700">
                      <Label htmlFor={`rate-${key}`}>{meta.label}</Label>
                      <p className="text-[10px] text-slate-500">{meta.hint}</p>
                      <div className="flex items-center gap-2">
                        <Input
                          id={`rate-${key}`}
                          type="number"
                          min={0}
                          step={key === "shift_money_unit" ? 0.01 : 1}
                          inputMode="decimal"
                          value={rates[key] === 0 ? "" : String(rates[key])}
                          placeholder="0"
                          onChange={(e) => updateRate(key, e.target.value)}
                        />
                        <span className="shrink-0 text-xs text-slate-500">{meta.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Button type="button" disabled={ratesSaving || ratesLoading} onClick={() => void handleSaveRates()}>
              <Save className="h-4 w-4" aria-hidden />
              {ratesSaving ? "Сохранение…" : "Сохранить расценки"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {!ratesConfigured ? (
            <div
              className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950 theme-dark:border-amber-800/60 theme-dark:bg-amber-950/35 theme-dark:text-amber-100"
              role="alert"
            >
              Расценки не заданы — начисления будут нулевыми. Перейдите на вкладку «Расценки» и сохраните
              ставки.
            </div>
          ) : null}

          <FilterPanel>
            <PeriodSwitcher preset={preset} onChange={setPreset} />
            <Input
              placeholder="Поиск по ФИО или должности"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={onlyApproved}
                onChange={(e) => setOnlyApproved(e.target.checked)}
              />
              Только согласованные отчёты
            </label>
            <div className="filter-btn-row">
              <Button type="button" variant="secondary" size="sm" onClick={() => void handleExport()} disabled={exporting}>
                <Download className="h-4 w-4" aria-hidden />
                {exporting ? "Выгрузка…" : "Excel"}
              </Button>
              <span className="text-xs text-slate-500 sm:ml-auto">
                Период: {periodLabel} · {filteredSheets.length} чел. · {formatRub(grandTotal)}
              </span>
            </div>
          </FilterPanel>

          {reportsFeed.loading ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : reportsFeed.error ? (
            <ErrorState message={reportsFeed.error} onRetry={reportsFeed.refresh} />
          ) : !filteredSheets.length ? (
            <EmptyState
              title="Нет данных для табеля за выбранный период."
              description={
                onlyApproved
                  ? "Согласуйте отчёты или снимите фильтр «Только согласованные»."
                  : "Изолировщики ещё не сдали отчёты за этот период."
              }
            />
          ) : (
            <div className="space-y-2">
              {filteredSheets.map((sheet) => (
                <TimesheetRowCard
                  key={sheet.uid}
                  sheet={sheet}
                  expanded={expandedUid === sheet.uid}
                  onToggle={() => setExpandedUid((prev) => (prev === sheet.uid ? null : sheet.uid))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
