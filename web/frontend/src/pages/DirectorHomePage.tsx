import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Download,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useItrPeriod } from "../hooks/useItrPeriod";
import { useReportFeed } from "../hooks/useReportFeed";
import { useTaskFeed } from "../hooks/useTaskFeed";
import { useUsersDirectory } from "../hooks/useUsersDirectory";
import { buildItrAccess, itrSectionMeta } from "../lib/itrAccess";
import { isApiConfigured } from "../lib/runtimeConfig";
import { exportExcel, exportPdf } from "../lib/exportReports";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { WidgetCard } from "../components/itr/WidgetCard";
import { StatTile } from "../components/itr/StatTile";
import { MiniBar } from "../components/itr/MiniBar";
import { SiteTopList } from "../components/itr/SiteTopList";
import { EmployeeRow } from "../components/itr/EmployeeRow";
import { AnomalyList } from "../components/itr/AnomalyList";
import { PeriodSwitcher } from "../components/itr/PeriodSwitcher";

function shortDate(iso: string): string {
  return iso.slice(5);
}

function DeferredRender({
  children,
  minHeightClass = "min-h-[220px]"
}: {
  children: React.ReactNode;
  minHeightClass?: string;
}) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visible) return;
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return <div ref={containerRef} className={visible ? "" : minHeightClass}>{visible ? children : null}</div>;
}

export function DirectorHomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const access = buildItrAccess(profile?.position, profile?.allowedSections);
  const { preset, setPreset } = useItrPeriod();
  const reports = useReportFeed({}, { autoRefresh: false });
  const tasks = useTaskFeed("assignedToMe", profile?.uid, { autoRefresh: false });
  const usersDirectory = useUsersDirectory({ autoRefresh: false });
  const { users, byUid } = usersDirectory;
  const deferredRows = useDeferredValue(reports.rows);
  const deferredTotals = useDeferredValue(reports.totals);
  const deferredUsers = useDeferredValue(users);
  const deferredTasks = useDeferredValue(tasks.tasks);
  const [exporting, setExporting] = useState<null | "excel" | "pdf">(null);
  const sectionTo = useCallback(
    (section: "home" | "reports" | "team" | "tasks" | "analytics" | "approvals" | "profile") =>
      access.hasSection(section) ? itrSectionMeta[section].to : itrSectionMeta.home.to,
    [access]
  );

  const display = profile?.fullName ? formatFullNameForDisplay(profile.fullName) : "Пользователь";

  const recentSubmitted = useMemo(
    () =>
      deferredRows
        .filter((r) => (r.status ?? "submitted") === "submitted")
        .slice(0, 3),
    [deferredRows]
  );

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const reportsByUidToday = useMemo(() => {
    const map = new Map<string, typeof deferredRows>();
    for (const row of deferredRows) {
      if (row.date !== todayIso) continue;
      const bucket = map.get(row.userId) || [];
      bucket.push(row);
      map.set(row.userId, bucket);
    }
    return map;
  }, [deferredRows, todayIso]);

  const todayShiftRows = useMemo(() => {
    return deferredTotals.todayShiftAuthors
      .map((uid) => {
        const user = byUid(uid);
        const userReports = reportsByUidToday.get(uid) || [];
        const meters = userReports.reduce(
          (s, r) => s + r.pipes.reduce((sum, p) => sum + (p.totalLength || 0), 0),
          0
        );
        return {
          uid,
          fullName: user?.fullName,
          position: user?.position,
          email: userReports[0]?.userEmail,
          reports: userReports.length,
          meters
        };
      })
      .slice(0, 6);
  }, [byUid, deferredTotals.todayShiftAuthors, reportsByUidToday]);

  const topAuthors = useMemo(() => {
    return deferredTotals.byAuthorTop.slice(0, 5).map(([uid, value]) => {
      const user = byUid(uid);
      return {
        uid,
        fullName: user?.fullName,
        position: user?.position,
        meters: value.meters,
        reports: value.reports
      };
    });
  }, [byUid, deferredTotals.byAuthorTop]);

  const myActiveTasks = useMemo(
    () => deferredTasks.filter((t) => t.status === "open").slice(0, 5),
    [deferredTasks]
  );
  const totalUsers = deferredUsers.length;
  const isolatorsCount = deferredUsers.filter((u) => u.role === "isolator").length;
  const directorsCount = deferredUsers.filter((u) => u.role === "director").length;
  const isolatorsWorkedCount = useMemo(() => {
    const worked = new Set<string>();
    for (const row of deferredRows) {
      const user = byUid(row.userId);
      if ((user?.position || "").trim() === "Изолировщик") {
        worked.add(row.userId);
      }
    }
    return worked.size;
  }, [byUid, deferredRows]);

  const anomaliesEnriched = useMemo(
    () =>
      deferredTotals.anomalies.map((a) => {
        const author = byUid(a.userId);
        return {
          ...a,
          authorName: author?.fullName ? formatFullNameForDisplay(author.fullName) : undefined
        };
      }),
    [byUid, deferredTotals.anomalies]
  );

  const dynamicsByDay = useMemo(
    () => deferredTotals.byDay.slice(-14).map((d) => ({ label: shortDate(d.date), value: d.reports })),
    [deferredTotals.byDay]
  );
  const metersByDay = useMemo(
    () =>
      deferredTotals.byDay.slice(-14).map((d) => ({ label: shortDate(d.date), value: Math.round(d.meters) })),
    [deferredTotals.byDay]
  );

  async function handleExport(kind: "excel" | "pdf") {
    setExporting(kind);
    try {
      if (kind === "excel") await exportExcel(reports.rows);
      else await exportPdf(reports.rows);
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
        <div className="hero-shell flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="hero-title text-xl font-semibold tracking-tight">Здравствуйте, {display}</h2>
            <p className="hero-subtitle mt-1 text-sm text-slate-100/90">
              {profile?.position ? `${profile.position} · ` : ""}
              {access.presetTitle}
            </p>
            <div className="hero-chip mt-2 inline-flex items-center rounded-full border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-100">
              Главный экран ИТР
            </div>
          </div>
          <div className="hero-icon-wrap">
            <Sparkles className="h-5 w-5 shrink-0 text-amber-300" />
          </div>
        </div>
      </div>

      <Card className="soft-ring surface-floating itr-panel itr-priority-info">
        <CardContent className="grid gap-3 p-3 md:grid-cols-3 sm:p-4">
          <div className="itr-kpi">
            <div className="itr-caption">Всего сотрудников</div>
            <div className="mt-1 text-xl font-semibold">{totalUsers}</div>
          </div>
          <div className="itr-kpi">
            <div className="itr-caption">Изолировщики</div>
            <div className="mt-1 text-xl font-semibold">{isolatorsCount}</div>
          </div>
          <div className="itr-kpi">
            <div className="itr-caption">ИТР</div>
            <div className="mt-1 text-xl font-semibold">{directorsCount}</div>
          </div>
        </CardContent>
      </Card>

      <div className="glass-toolbar itr-panel itr-priority-info space-y-2">
        <div className="flex items-center justify-between">
          <span className="itr-chip">Период</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSwitcher preset={preset} onChange={setPreset} />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              reports.refresh();
              tasks.refresh();
              void usersDirectory.refresh();
            }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Обновить
          </Button>
        </div>
      </div>

      {access.isField ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatTile
            label="Площадь изоляции"
            value={`${reports.totals.insulationArea.toFixed(1)} м²`}
            Icon={Layers}
            tone="emerald"
          />
          <StatTile
            label="Изолировщиков работало"
            value={String(isolatorsWorkedCount)}
            Icon={Users}
            tone="violet"
            hint="За выбранный период"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Площадь изоляции"
            value={`${reports.totals.insulationArea.toFixed(1)} м²`}
            Icon={Layers}
            tone="sky"
          />
          <StatTile
            label="Изолировщиков работало"
            value={String(isolatorsWorkedCount)}
            Icon={Users}
            tone="amber"
          />
        </div>
      )}

      {/* Командный пресет */}
      {access.isManagement && (
        <>
          <DeferredRender minHeightClass="min-h-[320px]">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <WidgetCard
                title="Динамика отчётов"
                Icon={BarChart3}
                actionLabel="В аналитику"
                actionTo={sectionTo("analytics")}
                description="За последние 14 дней"
              >
                <MiniBar data={dynamicsByDay} formatValue={(v) => `${v} отч.`} />
              </WidgetCard>
              <WidgetCard
                title="Динамика метров"
                Icon={TrendingUp}
                actionLabel="В аналитику"
                actionTo={sectionTo("analytics")}
                description="Σ метров по дням"
              >
                <MiniBar data={metersByDay} formatValue={(v) => `${v} м`} />
              </WidgetCard>
            </div>
          </DeferredRender>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <WidgetCard
              title="На согласование"
              Icon={ShieldCheck}
              badge={reports.totals.submittedCount}
              actionLabel="Открыть"
              actionTo={sectionTo("approvals")}
              description="Отчёты, ждущие вашего решения"
              className="itr-priority-warn"
            >
              {recentSubmitted.length === 0 ? (
                <div className="text-sm text-slate-500 theme-dark:text-slate-400">
                  Нет отчётов на согласование.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentSubmitted.map((r) => {
                    const author = byUid(r.userId);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className="pretty-list-item flex w-full items-center justify-between text-left"
                        onClick={() =>
                          r.id &&
                          navigate(`/report/${r.id}`, {
                            state: { directorBackTo: sectionTo("approvals") }
                          })
                        }
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {author?.fullName ? formatFullNameForDisplay(author.fullName) : r.userEmail}
                          </div>
                          <div className="text-[11px] text-slate-500 theme-dark:text-slate-400">
                            {r.date} · Блок {r.fullName || "—"}
                          </div>
                        </div>
                        <div className="text-xs font-semibold">
                          {r.pipes.reduce((s, p) => s + (p.totalLength || 0), 0).toFixed(1)} м
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </WidgetCard>

            <WidgetCard
              title="Активные задачи"
              Icon={ClipboardList}
              badge={tasks.openCount}
              badgeTone={tasks.overdueCount > 0 ? "danger" : "primary"}
              actionLabel="Все задачи"
              actionTo={sectionTo("tasks")}
              description="Назначенные мне"
              className={tasks.overdueCount > 0 ? "itr-priority-warn" : "itr-priority-info"}
            >
              {myActiveTasks.length === 0 ? (
                <div className="text-sm text-slate-500 theme-dark:text-slate-400">Открытых задач нет.</div>
              ) : (
                <div className="space-y-2">
                  {myActiveTasks.map((t) => (
                    <div
                      key={t.id}
                      className="pretty-list-item"
                    >
                      <div className="font-medium">{t.title}</div>
                      <div className="text-[11px] text-slate-500 theme-dark:text-slate-400">
                        {t.dueDate ? `до ${t.dueDate}` : "без срока"} · {t.createdByFullName ? formatFullNameForDisplay(t.createdByFullName) : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WidgetCard>
          </div>

          <DeferredRender minHeightClass="min-h-[320px]">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <WidgetCard title="Топ участков" Icon={Layers} actionLabel="К отчётам" actionTo={sectionTo("reports")} className="itr-priority-info">
                <SiteTopList items={deferredTotals.bySiteTop} />
              </WidgetCard>
              <WidgetCard title="Топ изолировщиков" Icon={Users} actionLabel="Команда" actionTo={sectionTo("team")} className="itr-priority-success">
                {topAuthors.length === 0 ? (
                  <div className="text-sm text-slate-500 theme-dark:text-slate-400">Нет данных.</div>
                ) : (
                  <div className="space-y-2">
                    {topAuthors.map((a) => (
                      <EmployeeRow
                        key={a.uid}
                        uid={a.uid}
                        fullName={a.fullName}
                        position={a.position}
                        reports={a.reports}
                        meters={a.meters}
                      />
                    ))}
                  </div>
                )}
              </WidgetCard>
            </div>
          </DeferredRender>

          <DeferredRender minHeightClass="min-h-[140px]">
            <Card className="soft-ring surface-floating itr-priority-info">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 theme-dark:text-slate-200">
                  <Download className="h-4 w-4" aria-hidden /> Скачать за период
                </div>
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
          </DeferredRender>
        </>
      )}

      {/* Инженерный пресет */}
      {access.isEngineer && (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <WidgetCard
              title="На согласование"
              Icon={ShieldCheck}
              badge={reports.totals.submittedCount}
              actionLabel="Открыть"
              actionTo={sectionTo("approvals")}
              description="Отчёты, ждущие проверки"
              className="itr-priority-warn"
            >
              {recentSubmitted.length === 0 ? (
                <div className="text-sm text-slate-500 theme-dark:text-slate-400">
                  Все отчёты согласованы.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentSubmitted.map((r) => {
                    const author = byUid(r.userId);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className="pretty-list-item flex w-full items-center justify-between text-left"
                        onClick={() =>
                          r.id &&
                          navigate(`/report/${r.id}`, {
                            state: { directorBackTo: sectionTo("approvals") }
                          })
                        }
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {author?.fullName ? formatFullNameForDisplay(author.fullName) : r.userEmail}
                          </div>
                          <div className="text-[11px] text-slate-500 theme-dark:text-slate-400">
                            {r.date} · Блок {r.fullName || "—"}
                          </div>
                        </div>
                        <div className="text-xs font-semibold">
                          {r.pipes.reduce((s, p) => s + (p.totalLength || 0), 0).toFixed(1)} м
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </WidgetCard>

            <WidgetCard
              title="Аномалии"
              Icon={AlertTriangle}
              badge={anomaliesEnriched.length}
              badgeTone={anomaliesEnriched.length ? "warning" : "primary"}
              description="Проверка качества данных"
              className={anomaliesEnriched.length ? "itr-priority-warn" : "itr-priority-info"}
            >
              <AnomalyList items={anomaliesEnriched} />
            </WidgetCard>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <WidgetCard title="Топ типов изоляции" Icon={Layers} className="itr-priority-info">
              {reports.totals.byTypeTop.length === 0 ? (
                <div className="text-sm text-slate-500 theme-dark:text-slate-400">Нет данных.</div>
              ) : (
                <div className="space-y-2">
                  {reports.totals.byTypeTop.map(([type, value]) => {
                    const max = reports.totals.byTypeTop[0]?.[1] || 1;
                    const pct = Math.max(2, Math.round((value / max) * 100));
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
            </WidgetCard>

            <WidgetCard title="Активные задачи" Icon={ClipboardList} badge={tasks.openCount} actionLabel="Все задачи" actionTo={sectionTo("tasks")} className={tasks.overdueCount > 0 ? "itr-priority-warn" : "itr-priority-info"}>
              {myActiveTasks.length === 0 ? (
                <div className="text-sm text-slate-500 theme-dark:text-slate-400">Открытых задач нет.</div>
              ) : (
                <div className="space-y-2">
                  {myActiveTasks.map((t) => (
                    <div
                      key={t.id}
                      className="pretty-list-item"
                    >
                      <div className="font-medium">{t.title}</div>
                      <div className="text-[11px] text-slate-500 theme-dark:text-slate-400">
                        {t.dueDate ? `до ${t.dueDate}` : "без срока"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WidgetCard>
          </div>
        </>
      )}

      {/* Полевой пресет */}
      {access.isField && (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <WidgetCard
              title="Сегодня на смене"
              Icon={Users}
              badge={todayShiftRows.length}
              actionLabel="Команда"
              actionTo={sectionTo("team")}
              description="Изолировщики, отправившие отчёт сегодня"
              className="itr-priority-success"
            >
              {todayShiftRows.length === 0 ? (
                <div className="text-sm text-slate-500 theme-dark:text-slate-400">
                  Сегодня отчётов пока нет.
                </div>
              ) : (
                <div className="space-y-2">
                  {todayShiftRows.map((row) => (
                    <EmployeeRow
                      key={row.uid}
                      uid={row.uid}
                      fullName={row.fullName}
                      position={row.position}
                      reports={row.reports}
                      meters={row.meters}
                      fallbackEmail={row.email}
                    />
                  ))}
                </div>
              )}
            </WidgetCard>

            <WidgetCard
              title="Мои задачи"
              Icon={ClipboardList}
              badge={tasks.openCount}
              badgeTone={tasks.overdueCount > 0 ? "danger" : "primary"}
              actionLabel="Все задачи"
              actionTo={sectionTo("tasks")}
              className={tasks.overdueCount > 0 ? "itr-priority-warn" : "itr-priority-info"}
            >
              {myActiveTasks.length === 0 ? (
                <div className="text-sm text-slate-500 theme-dark:text-slate-400">Открытых задач нет.</div>
              ) : (
                <div className="space-y-2">
                  {myActiveTasks.map((t) => (
                    <div
                      key={t.id}
                      className="pretty-list-item"
                    >
                      <div className="font-medium">{t.title}</div>
                      <div className="text-[11px] text-slate-500 theme-dark:text-slate-400">
                        {t.dueDate ? `до ${t.dueDate}` : "без срока"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </WidgetCard>
          </div>

          <WidgetCard title="Топ изолировщиков по выработке" Icon={Users} actionLabel="Команда" actionTo={sectionTo("team")} className="itr-priority-success">
            {topAuthors.length === 0 ? (
              <div className="text-sm text-slate-500 theme-dark:text-slate-400">Нет данных за период.</div>
            ) : (
              <div className="space-y-2">
                {topAuthors.map((a) => (
                  <EmployeeRow
                    key={a.uid}
                    uid={a.uid}
                    fullName={a.fullName}
                    position={a.position}
                    reports={a.reports}
                    meters={a.meters}
                  />
                ))}
              </div>
            )}
          </WidgetCard>
        </>
      )}

      {/* Дефолтный пресет */}
      {!access.isManagement && !access.isEngineer && !access.isField && (
        <WidgetCard title="Топ участков" Icon={Layers} actionLabel="К отчётам" actionTo={sectionTo("reports")}>
          <SiteTopList items={reports.totals.bySiteTop} />
        </WidgetCard>
      )}

      {!isApiConfigured && (
        <Card className="soft-ring surface-floating">
          <CardContent className="space-y-2 p-4 text-sm text-slate-600 theme-dark:text-slate-300">
            Расширенные виджеты (Команда, Задачи, Согласование) активны только в локальной версии. Сейчас вы видите базовый отчётный обзор.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
