import { useMemo } from "react";
import { PieChart, TrendingUp } from "lucide-react";
import { useReportFeed } from "../hooks/useReportFeed";
import { useUsersDirectory } from "../hooks/useUsersDirectory";
import { useItrPeriod } from "../hooks/useItrPeriod";
import { Card, CardContent } from "../components/ui/card";
import { WidgetCard } from "../components/itr/WidgetCard";
import { MiniBar } from "../components/itr/MiniBar";
import { PeriodSwitcher } from "../components/itr/PeriodSwitcher";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";

function shortDate(iso: string): string {
  return iso.slice(5);
}

export function DirectorAnalyticsPage() {
  const reports = useReportFeed();
  const usersDirectory = useUsersDirectory();
  const { preset, setPreset } = useItrPeriod();

  const isolatorRows = useMemo(() => {
    return reports.rows.filter((row) => {
      const user = usersDirectory.byUid(row.userId);
      return (user?.position || "").trim() === "Изолировщик";
    });
  }, [reports.rows, usersDirectory]);

  const byDay = useMemo(() => {
    const map = new Map<string, { reports: number; meters: number }>();
    for (const row of isolatorRows) {
      const prev = map.get(row.date) ?? { reports: 0, meters: 0 };
      const meters = row.pipes.reduce((sum, pipe) => sum + (pipe.totalLength || 0), 0);
      map.set(row.date, { reports: prev.reports + 1, meters: prev.meters + meters });
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, ...value }));
  }, [isolatorRows]);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of isolatorRows) {
      for (const pipe of row.pipes) {
        const key = pipe.insulationType || "—";
        map.set(key, (map.get(key) ?? 0) + (pipe.totalLength || 0));
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [isolatorRows]);

  const bySite = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of isolatorRows) {
      for (const pipe of row.pipes) {
        const key = pipe.siteName || "—";
        map.set(key, (map.get(key) ?? 0) + (pipe.totalLength || 0));
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [isolatorRows]);

  const dailyReports = useMemo(
    () => byDay.map((d) => ({ label: shortDate(d.date), value: d.reports })),
    [byDay]
  );
  const dailyMeters = useMemo(
    () => byDay.map((d) => ({ label: shortDate(d.date), value: Math.round(d.meters) })),
    [byDay]
  );

  const avgByDay = useMemo(
    () =>
      byDay.map((d) => ({
        label: shortDate(d.date),
        value: d.reports ? Math.round(d.meters / d.reports) : 0
      })),
    [byDay]
  );

  const topAuthors = useMemo(() => {
    const map = new Map<string, { meters: number; reports: number }>();
    for (const row of isolatorRows) {
      const meters = row.pipes.reduce((sum, pipe) => sum + (pipe.totalLength || 0), 0);
      const prev = map.get(row.userId) ?? { meters: 0, reports: 0 };
      map.set(row.userId, { meters: prev.meters + meters, reports: prev.reports + 1 });
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].meters - a[1].meters)
      .slice(0, 10)
      .map(([uid, value]) => {
      const user = usersDirectory.byUid(uid);
      return {
        uid,
        fullName: user?.fullName,
        position: user?.position,
        meters: value.meters,
        reports: value.reports
      };
    });
  }, [isolatorRows, usersDirectory]);

  const insulationMax = byType[0]?.[1] ?? 0;
  const siteMax = bySite[0]?.[1] ?? 0;

  return (
    <div className="page-stack">
      <div className="surface-highlight surface-hero-light animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Аналитика</h2>
            <p className="mt-1 text-sm text-slate-100/90">
              Динамика по отчётам изолировщиков, выработка и структура изоляции.
            </p>
          </div>
          <PieChart className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      <div className="glass-toolbar itr-panel itr-priority-info space-y-2">
        <div className="flex items-center justify-between">
          <span className="itr-chip">Период аналитики</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSwitcher preset={preset} onChange={setPreset} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <WidgetCard title="Отчёты по дням" Icon={TrendingUp} description="Кол-во отчётов">
          <MiniBar data={dailyReports} formatValue={(v) => `${v} отч.`} height={120} />
        </WidgetCard>
        <WidgetCard title="Метры по дням" Icon={TrendingUp} description="Σ протяжённости">
          <MiniBar data={dailyMeters} formatValue={(v) => `${v} м`} height={120} />
        </WidgetCard>
      </div>

      <WidgetCard title="Средний размер смены" description="Метры на отчёт по дням">
        <MiniBar data={avgByDay} formatValue={(v) => `${v} м/отч.`} height={120} />
      </WidgetCard>

      <Card className="soft-ring surface-floating itr-panel">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 theme-dark:text-slate-200">
            Топ изолировщиков по выработке
          </div>
          {topAuthors.length === 0 ? (
            <div className="text-sm text-slate-500 theme-dark:text-slate-400">Нет данных за период.</div>
          ) : (
            <div className="space-y-2">
              {topAuthors.map((a) => {
                const max = topAuthors[0]?.meters || 1;
                const pct = Math.max(2, Math.round((a.meters / max) * 100));
                return (
                  <div key={a.uid}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate">
                        {a.fullName ? formatFullNameForDisplay(a.fullName) : a.uid}
                        {a.position ? ` · ${a.position}` : ""}
                      </span>
                      <span className="font-semibold">
                        {a.meters.toFixed(1)} м · {a.reports} отч.
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-200 theme-dark:bg-slate-800">
                      <div
                        className="h-1.5 rounded-full bg-primary/70 theme-dark:bg-accent/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="soft-ring surface-floating itr-panel">
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-200">
              Распределение по типам изоляции
            </div>
            {byType.length === 0 ? (
              <div className="text-sm text-slate-500 theme-dark:text-slate-400">Нет данных.</div>
            ) : (
              <div className="space-y-2">
                {byType.map(([type, value]) => {
                  const pct = Math.max(2, Math.round((value / (insulationMax || 1)) * 100));
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate">{type}</span>
                        <span className="font-semibold">{value.toFixed(1)} м</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-200 theme-dark:bg-slate-800">
                        <div
                          className="h-1.5 rounded-full bg-primary/70 theme-dark:bg-accent/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="soft-ring surface-floating itr-panel">
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-200">
              Распределение по участкам
            </div>
            {bySite.length === 0 ? (
              <div className="text-sm text-slate-500 theme-dark:text-slate-400">Нет данных.</div>
            ) : (
              <div className="space-y-2">
                {bySite.map(([site, value]) => {
                  const pct = Math.max(2, Math.round((value / (siteMax || 1)) * 100));
                  return (
                    <div key={site}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate">{site}</span>
                        <span className="font-semibold">{value.toFixed(1)} м</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-200 theme-dark:bg-slate-800">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500/70 theme-dark:bg-emerald-400/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
