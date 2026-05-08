import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useUsersDirectory } from "../hooks/useUsersDirectory";
import { useReportFeed } from "../hooks/useReportFeed";
import { useItrPeriod } from "../hooks/useItrPeriod";
import { POSITION_OPTIONS } from "../lib/positions";
import { isApiConfigured } from "../lib/runtimeConfig";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { EmployeeRow } from "../components/itr/EmployeeRow";
import { PeriodSwitcher } from "../components/itr/PeriodSwitcher";
import {
  getReportJointsCount,
  getReportTotalLength
} from "../lib/reportAggregations";
import type { Profile } from "../types";

interface AggregatedStat {
  reports: number;
  meters: number;
  joints: number;
  lastDate: string;
}

const POSITION_GROUPS: Array<{ title: string; positions: string[] }> = [
  { title: "ИТР", positions: ["Начальник участка", "Руководитель проекта", "Инженер ПТО", "Инженер ПТО (Д)", "Производитель работ", "Мастер участка"] },
  { title: "Маляры", positions: ["Маляр"] },
  { title: "Изолировщики", positions: ["Изолировщик"] }
];

export function DirectorTeamPage() {
  const usersDirectory = useUsersDirectory();
  const reports = useReportFeed();
  const { preset, setPreset } = useItrPeriod();
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("");

  const stats = useMemo(() => {
    const map = new Map<string, AggregatedStat>();
    for (const r of reports.rows) {
      const entry = map.get(r.userId) ?? { reports: 0, meters: 0, joints: 0, lastDate: "" };
      entry.reports += 1;
      entry.meters += getReportTotalLength(r);
      entry.joints += getReportJointsCount(r);
      if (!entry.lastDate || r.date > entry.lastDate) entry.lastDate = r.date;
      map.set(r.userId, entry);
    }
    return map;
  }, [reports.rows]);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return usersDirectory.users.filter((u) => {
      if (u.role === "admin") return false;
      if (positionFilter && (u.position || "") !== positionFilter) return false;
      if (needle && !u.fullName.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [usersDirectory.users, search, positionFilter]);

  const grouped = useMemo(() => {
    const buckets: Array<{ title: string; users: Profile[] }> = POSITION_GROUPS.map((group) => ({
      title: group.title,
      users: filteredUsers.filter((u) => group.positions.includes(u.position || ""))
    }));
    const handled = new Set(buckets.flatMap((b) => b.users));
    const others = filteredUsers.filter((u) => !handled.has(u));
    if (others.length) buckets.push({ title: "Прочее", users: others });
    return buckets.filter((b) => b.users.length > 0);
  }, [filteredUsers]);

  const todayShiftRows = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayUserIds = new Set(reports.rows.filter((r) => r.date === today).map((r) => r.userId));
    return filteredUsers.filter((u) => todayUserIds.has(u.uid));
  }, [reports.rows, filteredUsers]);

  if (!isApiConfigured) {
    return (
      <div className="page-stack">
        <div className="surface-highlight surface-hero-light animate-in-up p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Команда</h2>
              <p className="mt-1 text-sm text-slate-100/90">Доступно только в локальной версии.</p>
            </div>
            <Users className="h-5 w-5 shrink-0 text-amber-300" />
          </div>
        </div>
        <Card className="soft-ring">
          <CardContent className="p-4 text-sm text-slate-600 theme-dark:text-slate-300">
            Раздел «Команда» работает с локальной БД пользователей. Откройте приложение в локальной версии.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="surface-highlight surface-hero-light animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Команда</h2>
            <p className="mt-1 text-sm text-slate-100/90">
              Сотрудники по должностям с выработкой за период.
            </p>
          </div>
          <Users className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      <div className="glass-toolbar itr-panel itr-priority-info space-y-2">
        <div className="flex items-center justify-between">
          <span className="itr-chip">Фильтры команды</span>
        </div>
        <Input
          placeholder="Поиск по ФИО"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск по ФИО"
        />
        <div className="responsive-toolbar-controls sm:grid sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSwitcher preset={preset} onChange={setPreset} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-3 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              aria-label="Фильтр по должности"
            >
              <option value="">Все должности</option>
              {POSITION_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" size="sm" onClick={() => setPositionFilter("")}>
              Сбросить
            </Button>
          </div>
        </div>
      </div>

      {todayShiftRows.length > 0 && (
        <Card className="soft-ring itr-panel itr-priority-success">
          <CardContent className="space-y-2 p-4">
            <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-200">
              Сегодня на смене ({todayShiftRows.length})
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {todayShiftRows.map((u) => {
                const stat = stats.get(u.uid);
                return (
                  <EmployeeRow
                    key={u.uid}
                    uid={u.uid}
                    fullName={u.fullName}
                    position={u.position}
                    reports={stat?.reports}
                    meters={stat?.meters}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {usersDirectory.loading ? (
        <Card className="soft-ring itr-panel itr-priority-info">
          <CardContent className="p-4 text-sm text-slate-500 theme-dark:text-slate-400">Загрузка…</CardContent>
        </Card>
      ) : filteredUsers.length === 0 ? (
        <Card className="soft-ring itr-panel itr-priority-info">
          <CardContent className="space-y-3 p-4 text-sm text-slate-600 theme-dark:text-slate-300">
            <p>По текущим фильтрам сотрудников не найдено.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setPositionFilter("")}>
                Сбросить должность
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setSearch("")}>
                Очистить поиск
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => (
            <Card
              key={group.title}
              className={
                group.title === "Изолировщики"
                  ? "soft-ring itr-panel itr-priority-success"
                  : group.title === "ИТР"
                    ? "soft-ring itr-panel itr-priority-info"
                    : "soft-ring itr-panel itr-priority-info"
              }
            >
              <CardContent className="space-y-2 p-4">
                <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-200">
                  {group.title} · {group.users.length}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.users.map((u) => {
                    const stat = stats.get(u.uid);
                    return (
                      <EmployeeRow
                        key={u.uid}
                        uid={u.uid}
                        fullName={u.fullName}
                        position={u.position}
                        reports={stat?.reports ?? 0}
                        meters={stat?.meters}
                        joints={stat?.joints}
                        lastDate={stat?.lastDate || undefined}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-[11px] text-slate-500 theme-dark:text-slate-400">
        Клик по сотруднику открывает его отчёты. Найдено: {filteredUsers.length}.
      </div>
    </div>
  );
}
