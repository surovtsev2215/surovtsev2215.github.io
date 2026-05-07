import { useDeferredValue, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ListFilter } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useExecutiveReportsState, type PeriodPreset } from "../hooks/useExecutiveReportsState";
import {
  formatLineNames,
  getReportPipeCount,
  getReportTotalLength
} from "../lib/reportAggregations";

const periodOptions: { label: string; value: PeriodPreset }[] = [
  { label: "Сегодня", value: "today" },
  { label: "7 дней", value: 7 },
  { label: "30 дней", value: 30 },
  { label: "Всё", value: "all" }
];

export function DirectorReportsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useExecutiveReportsState();
  const siteFromUrl = searchParams.get("site") ?? "";
  const deferredRows = useDeferredValue(state.rows);

  useEffect(() => {
    if (siteFromUrl) state.setSearch(siteFromUrl);
  }, [siteFromUrl]);

  const rows = useMemo(() => deferredRows, [deferredRows]);

  return (
    <div className="page-stack">
      <div className="surface-highlight animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Отчёты компании</h2>
            <p className="mt-1 text-sm text-slate-100/90">Поиск, фильтрация и быстрый переход в карточку отчёта.</p>
          </div>
          <ListFilter className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      <div className="glass-toolbar space-y-2">
        <Input
          placeholder="Поиск: блок, линия, тип изоляции"
          value={state.search}
          onChange={(e) => {
            const next = e.target.value;
            state.setSearch(next);
            const params = new URLSearchParams(searchParams);
            if (next.trim()) params.set("site", next.trim());
            else params.delete("site");
            setSearchParams(params, { replace: true });
          }}
          aria-label="Поиск по блоку, линии или типу изоляции"
        />
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
        <details>
          <summary className="cursor-pointer py-1 text-sm text-slate-600 theme-dark:text-slate-300">Точные даты</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Input type="date" value={state.manualFrom} onChange={(e) => state.setManualFrom(e.target.value)} />
            <Input type="date" value={state.manualTo} onChange={(e) => state.setManualTo(e.target.value)} />
          </div>
        </details>
      </div>

      {state.loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : !rows.length ? (
        <Card className="soft-ring">
          <CardContent className="space-y-2 p-4 text-sm">
            <p className="text-slate-600 theme-dark:text-slate-300">По текущим фильтрам отчётов не найдено.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => state.setSearch("")}>
                Сбросить поиск
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  state.setManualFrom("");
                  state.setManualTo("");
                  state.setPreset("all");
                }}
              >
                Показать всё время
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
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
      )}
    </div>
  );
}
