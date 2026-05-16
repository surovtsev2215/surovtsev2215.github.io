import { Suspense, memo, useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ClipboardList, History, ListFilter, Menu, Users } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { formatFullNameForDisplay } from "../../lib/normalizeFullName";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { buildItrAccess, itrSectionMeta, type ItrPreloadKey, type ItrSection } from "../../lib/itrAccess";
import { isApiConfigured } from "../../lib/runtimeConfig";
import { useReportFeed } from "../../hooks/useReportFeed";
import { useTaskFeed } from "../../hooks/useTaskFeed";
import { SiteVersionFooter } from "./SiteVersionFooter";

type StaticPreload =
  | "form"
  | "history"
  | "adminUsers"
  | "adminReports"
  | "directorWorkspace";

const preloadedTargets = new Set<StaticPreload | ItrPreloadKey>();

function preloadPage(target: StaticPreload | ItrPreloadKey) {
  if (preloadedTargets.has(target)) return;
  preloadedTargets.add(target);
  switch (target) {
    case "form":
      void import("../../pages/FormPage");
      return;
    case "history":
      void import("../../pages/HistoryPage");
      return;
    case "adminUsers":
      void import("../../pages/AdminUsersPage");
      return;
    case "adminReports":
      void import("../../pages/AdminReportsPage");
      return;
    case "directorWorkspace":
      void import("../../pages/DirectorWorkspacePage");
      return;
    case "directorReports":
      void import("../../pages/DirectorReportsPage");
      return;
    case "directorTeam":
      void import("../../pages/DirectorTeamPage");
      return;
    case "directorTasks":
      void import("../../pages/DirectorTasksPage");
      return;
    case "directorApprovals":
      void import("../../pages/DirectorApprovalsPage");
      return;
    case "directorProfile":
      void import("../../pages/DirectorProfilePage");
      return;
  }
}

function PrefetchNavLink({
  to,
  label,
  className,
  preload,
  end,
  badge,
  badgeTone,
  Icon
}: {
  to: string;
  label: string;
  className: ({ isActive }: { isActive: boolean }) => string;
  preload: StaticPreload | ItrPreloadKey;
  end?: boolean;
  badge?: number;
  badgeTone?: "primary" | "warning" | "danger";
  Icon?: typeof ClipboardList;
}) {
  const prefetch = () => preloadPage(preload);
  const tone =
    badgeTone === "warning"
      ? "bg-amber-100 text-amber-700 theme-dark:bg-amber-900/40 theme-dark:text-amber-300"
      : badgeTone === "danger"
        ? "bg-rose-100 text-rose-700 theme-dark:bg-rose-900/40 theme-dark:text-rose-300"
        : "bg-primary/10 text-primary theme-dark:bg-accent/20 theme-dark:text-accent";
  return (
    <NavLink
      to={to}
      className={className}
      end={end}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
    >
      <span className="flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </span>
      {typeof badge === "number" && badge > 0 ? (
        <span className={cn("ml-auto inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold", tone)}>
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </NavLink>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
    isActive
      ? "bg-primary text-white shadow-sm"
      : "text-slate-700 hover:bg-slate-100 hover:translate-x-0.5 theme-dark:text-slate-200 theme-dark:hover:bg-slate-800"
  );

const directorNavClass = (isActive: boolean) =>
  cn(
    "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all w-full",
    isActive
      ? "bg-primary text-white shadow-sm"
      : "text-slate-700 hover:bg-slate-100 hover:translate-x-0.5 theme-dark:text-slate-200 theme-dark:hover:bg-slate-800"
  );

const directorBottomClass = (isActive: boolean) =>
  cn(
    "relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold leading-none transition-all",
    isActive
      ? "bg-primary/10 text-primary theme-dark:bg-accent/15 theme-dark:text-accent"
      : "text-slate-700 theme-dark:text-slate-300"
  );

const bottomNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold leading-none transition-all",
    isActive
      ? "bg-primary/10 text-primary theme-dark:bg-accent/15 theme-dark:text-accent"
      : "text-slate-700 theme-dark:text-slate-300"
  );

const ItrSidebar = memo(function ItrSidebar({
  sections,
  badges,
  activeSection,
  onSelect
}: {
  sections: ItrSection[];
  badges: Partial<Record<ItrSection, { count: number; tone: "primary" | "warning" | "danger" }>>;
  activeSection: ItrSection;
  onSelect: (section: ItrSection) => void;
}) {
  return (
    <aside className="glass hidden rounded-2xl p-2.5 shadow-card md:block">
      <nav className="flex flex-col gap-1">
        {sections.map((section) => {
          const meta = itrSectionMeta[section];
          const badge = badges[section];
          return (
            <button key={section} type="button" onClick={() => onSelect(section)} className={directorNavClass(activeSection === section)}>
              <span className="flex items-center gap-2">
                <meta.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{meta.label}</span>
              </span>
              {typeof badge?.count === "number" && badge.count > 0 ? (
                <span className={cn("ml-auto inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold", badge.tone === "warning" ? "bg-amber-100 text-amber-700 theme-dark:bg-amber-900/40 theme-dark:text-amber-300" : badge.tone === "danger" ? "bg-rose-100 text-rose-700 theme-dark:bg-rose-900/40 theme-dark:text-rose-300" : "bg-primary/10 text-primary theme-dark:bg-accent/20 theme-dark:text-accent")}>
                  {badge.count > 99 ? "99+" : badge.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
});

const ItrBottomNav = memo(function ItrBottomNav({
  sections,
  badges,
  activeSection,
  onSelect
}: {
  sections: ItrSection[];
  badges: Partial<Record<ItrSection, { count: number; tone: "primary" | "warning" | "danger" }>>;
  activeSection: ItrSection;
  onSelect: (section: ItrSection) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = sections.slice(0, 4);
  const overflow = sections.slice(4);

  return (
    <>
      {primary.map((section) => {
        const meta = itrSectionMeta[section];
        const badge = badges[section];
        const Icon = meta.icon;
        return (
          <button
            key={section}
            type="button"
            onClick={() => onSelect(section)}
            className={directorBottomClass(activeSection === section)}
            onMouseEnter={() => preloadPage(meta.preload)}
            onFocus={() => preloadPage(meta.preload)}
            onTouchStart={() => preloadPage(meta.preload)}
          >
            <span className="relative inline-flex">
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              {badge && badge.count > 0 ? (
                <span
                  className={cn(
                    "absolute -right-1.5 -top-1.5 inline-flex min-w-[1rem] justify-center rounded-full px-1 py-0.5 text-[9px] font-semibold",
                    badge.tone === "warning"
                      ? "bg-amber-500 text-white"
                      : badge.tone === "danger"
                        ? "bg-rose-500 text-white"
                        : "bg-primary text-white"
                  )}
                >
                  {badge.count > 99 ? "99+" : badge.count}
                </span>
              ) : null}
            </span>
            <span>{meta.label}</span>
          </button>
        );
      })}
      {overflow.length > 0 && (
        <button
          type="button"
          className={cn(
            "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-medium transition-all",
            moreOpen
              ? "bg-primary/10 text-primary theme-dark:bg-accent/15 theme-dark:text-accent"
              : "text-slate-600 theme-dark:text-slate-400"
          )}
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="Ещё"
          aria-expanded={moreOpen}
        >
          <Menu className="h-5 w-5 shrink-0" aria-hidden />
          <span>Ещё</span>
        </button>
      )}
      {moreOpen && overflow.length > 0 && (
        <div
          className="absolute bottom-[calc(100%+8px)] right-2 z-40 w-[min(14rem,calc(100vw-1rem))] rounded-2xl border border-slate-200 bg-white p-2 shadow-lg theme-dark:border-slate-700 theme-dark:bg-slate-900"
          role="menu"
        >
          {overflow.map((section) => {
            const meta = itrSectionMeta[section];
            const badge = badges[section];
            const Icon = meta.icon;
            return (
              <button
                key={section}
                type="button"
                onClick={() => {
                  onSelect(section);
                  setMoreOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm",
                  activeSection === section
                    ? "bg-primary/10 text-primary theme-dark:bg-accent/15 theme-dark:text-accent"
                    : "text-slate-700 theme-dark:text-slate-200"
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" aria-hidden /> {meta.label}
                </span>
                {badge && badge.count > 0 ? (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary theme-dark:bg-accent/20 theme-dark:text-accent">
                    {badge.count > 99 ? "99+" : badge.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
});

function ItrBadgeProvider() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reports = useReportFeed({ status: "submitted" });
  const tasks = useTaskFeed("assignedToMe", profile?.uid);
  const access = useMemo(
    () => buildItrAccess(profile?.position, profile?.allowedSections),
    [profile?.position, profile?.allowedSections]
  );
  const rawSection = new URLSearchParams(location.search).get("section");
  const normalized =
    rawSection === "home" || rawSection === "analytics" ? "reports" : (rawSection as ItrSection);
  const activeSection: ItrSection = access.hasSection(normalized)
    ? normalized
    : (access.sections[0] ?? "reports");

  useEffect(() => {
    const warmSections = access.sections.slice(0, 2);
    for (const section of warmSections) {
      preloadPage(itrSectionMeta[section].preload);
    }
  }, [access.sections.join("|")]);

  const badges = useMemo<Partial<Record<ItrSection, { count: number; tone: "primary" | "warning" | "danger" }>>>(() => {
    const next: Partial<Record<ItrSection, { count: number; tone: "primary" | "warning" | "danger" }>> = {};
    if (access.hasSection("approvals")) {
      next.approvals = {
        count: reports.totals.submittedCount,
        tone: reports.error ? "warning" : "primary"
      };
    }
    if (access.hasSection("tasks")) {
      const tone: "warning" | "danger" | "primary" =
        tasks.error
          ? "warning"
          : tasks.overdueCount > 0
            ? "danger"
            : tasks.openCount > 0
              ? "warning"
              : "primary";
      next.tasks = { count: tasks.openCount, tone };
    }
    return next;
  }, [access, reports.error, reports.totals.submittedCount, tasks.error, tasks.openCount, tasks.overdueCount]);

  const selectSection = useCallback(
    (section: ItrSection) => {
      const target = section === "home" || section === "analytics" ? "reports" : section;
      if (target === activeSection) return;
      preloadPage("directorWorkspace");
      navigate(`/director?section=${target}`, { replace: true });
    },
    [activeSection, navigate]
  );

  return (
    <>
      <ItrSidebar sections={access.sections} badges={badges} activeSection={activeSection} onSelect={selectSection} />
      <nav
        className="glass fixed bottom-0 left-0 right-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Основная навигация ИТР"
      >
        <div className="relative mx-auto flex max-w-6xl px-2 pb-2 pt-1.5">
          <ItrBottomNav sections={access.sections} badges={badges} activeSection={activeSection} onSelect={selectSection} />
        </div>
      </nav>
    </>
  );
}

export function AppLayout() {
  const { role, profile, logout } = useAuth();
  const location = useLocation();
  const isAdmin = role === "admin";
  const isDirector = role === "director";
  const isIsolator = role === "isolator";
  const [dark, setDark] = useState(false);
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);

  useEffect(() => {
    const saved = localStorage.getItem("pto-theme");
    const enabled = saved === "dark";
    setDark(enabled);
    document.documentElement.classList.toggle("theme-dark", enabled);
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("pto-theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("theme-dark", next);
  }

  const layoutGridClass = useMemo(
    () => (isDirector || isAdmin ? "md:grid-cols-[240px_minmax(0,1fr)]" : ""),
    [isDirector, isAdmin]
  );

  return (
    <div className="min-h-screen pb-[calc(7.25rem+env(safe-area-inset-bottom))] md:pb-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-slate-900"
      >
        Перейти к основному содержимому
      </a>
      <header className="glass sticky top-0 z-20 border-b">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-2 px-3 py-2.5 sm:flex-nowrap sm:items-center sm:px-5 sm:py-3.5">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-primary theme-dark:text-accent sm:text-base">
              Система контроля изоляции трубопроводов
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 sm:hidden">
              <span
                className={cn(
                  "inline-flex rounded-full border px-2 py-0.5 text-[10px]",
                  role === "admin"
                    ? "border-amber-200 bg-amber-50 text-amber-700 theme-dark:border-amber-700 theme-dark:bg-amber-900/40 theme-dark:text-amber-300"
                    : role === "director"
                      ? "border-violet-200 bg-violet-50 text-violet-700 theme-dark:border-violet-700 theme-dark:bg-violet-900/40 theme-dark:text-violet-300"
                      : "border-sky-200 bg-sky-50 text-sky-700 theme-dark:border-sky-700 theme-dark:bg-sky-900/40 theme-dark:text-sky-300"
                )}
              >
                {role === "admin" ? "Админ" : role === "director" ? "ИТР" : "Изолировщик"}
              </span>
              {isDirector && profile?.position ? (
                <span className="inline-flex max-w-[120px] truncate rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] text-slate-700 theme-dark:border-slate-700 theme-dark:bg-slate-800/70 theme-dark:text-slate-200">
                  {profile.position}
                </span>
              ) : null}
              <span
                className={cn(
                  "inline-flex rounded-full border px-2 py-0.5 text-[10px]",
                  online
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 theme-dark:border-emerald-800 theme-dark:bg-emerald-950/40 theme-dark:text-emerald-300"
                    : "border-amber-200 bg-amber-50 text-amber-700 theme-dark:border-amber-900 theme-dark:bg-amber-950/30 theme-dark:text-amber-300"
                )}
              >
                {online ? "Онлайн" : "Офлайн"}
              </span>
            </div>
          </div>
          <div className="flex w-auto items-center justify-end gap-1.5 self-start sm:w-auto sm:self-auto sm:gap-3">
            <span className="hidden max-w-[160px] truncate rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[11px] text-slate-700 sm:inline theme-dark:border-slate-700 theme-dark:bg-slate-800/70 theme-dark:text-slate-200">
              {profile?.fullName ? formatFullNameForDisplay(profile.fullName) : "Пользователь"}
            </span>
            {isDirector && profile?.position ? (
              <span className="hidden max-w-[180px] truncate rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-[11px] text-slate-700 sm:inline theme-dark:border-slate-700 theme-dark:bg-slate-800/70 theme-dark:text-slate-200">
                {profile.position}
              </span>
            ) : null}
            <span
              className={cn(
                "badge-live hidden rounded-full border px-2 py-1 text-[10px] sm:inline",
                online
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 theme-dark:border-emerald-800 theme-dark:bg-emerald-950/40 theme-dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50 text-amber-700 theme-dark:border-amber-900 theme-dark:bg-amber-950/30 theme-dark:text-amber-300"
              )}
            >
              {online ? "Онлайн" : "Офлайн"}
            </span>
            <Button type="button" variant="secondary" size="sm" className="px-2 sm:px-3" onClick={toggleTheme}>
              <span className="sm:hidden">{dark ? "Свет" : "Тема"}</span>
              <span className="hidden sm:inline">{dark ? "Светлая" : "Тёмная"}</span>
            </Button>
            <Button type="button" variant="outline" size="sm" className="px-2 sm:px-3" onClick={() => logout()}>
              <span className="sm:hidden">Выход</span>
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </div>
        </div>
        {!isApiConfigured && (
          <div className="mx-auto max-w-7xl px-3 pb-2 sm:px-5">
            <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-3 py-2 text-xs text-rose-900 theme-dark:border-rose-800 theme-dark:bg-rose-950/40 theme-dark:text-rose-100">
              Сайт не подключён к серверу — отчёты и фото не сохранятся. Обратитесь к администратору.
            </div>
          </div>
        )}
      </header>

      <div className={cn("mx-auto grid w-full max-w-7xl gap-3 px-2 py-2 sm:gap-4 sm:px-5 sm:py-4", layoutGridClass)}>
        {isDirector && isApiConfigured ? <ItrBadgeProvider /> : null}
        {isAdmin ? (
          <aside className="glass hidden rounded-2xl p-2.5 shadow-card md:block">
            <nav className="flex flex-col gap-1">
              <PrefetchNavLink
                to="/admin/users"
                label="Пользователи"
                className={navLinkClass}
                preload="adminUsers"
                Icon={Users}
                end
              />
              <PrefetchNavLink
                to="/admin/reports"
                label="Все отчёты"
                className={navLinkClass}
                preload="adminReports"
                Icon={ListFilter}
              />
            </nav>
          </aside>
        ) : null}
        <main id="main-content" className="glass rounded-2xl p-2.5 pb-24 shadow-card sm:p-4 md:pb-5 lg:p-5">
          <Suspense
            fallback={
              <div className="space-y-3">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            }
          >
            <div key={location.pathname} className={isDirector ? "" : "route-transition"}>
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>

      <SiteVersionFooter className="mx-auto max-w-7xl md:px-5" />

      {!isDirector && (
        <nav
          className="glass fixed bottom-0 left-0 right-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Основная навигация"
        >
          <div className="mx-auto flex max-w-6xl px-2 pb-2 pt-1.5">
            {isIsolator && (
              <>
                <NavLink
                  to="/form"
                  className={bottomNavLinkClass}
                  end
                  onMouseEnter={() => preloadPage("form")}
                  onFocus={() => preloadPage("form")}
                  onTouchStart={() => preloadPage("form")}
                >
                  <ClipboardList className="h-5 w-5 shrink-0" aria-hidden />
                  <span>Отчёт</span>
                </NavLink>
                <NavLink
                  to="/history"
                  className={bottomNavLinkClass}
                  onMouseEnter={() => preloadPage("history")}
                  onFocus={() => preloadPage("history")}
                  onTouchStart={() => preloadPage("history")}
                >
                  <History className="h-5 w-5 shrink-0" aria-hidden />
                  <span>История</span>
                </NavLink>
              </>
            )}
            {isAdmin && (
              <>
                <NavLink
                  to="/admin/users"
                  className={bottomNavLinkClass}
                  end
                  onMouseEnter={() => preloadPage("adminUsers")}
                  onFocus={() => preloadPage("adminUsers")}
                  onTouchStart={() => preloadPage("adminUsers")}
                >
                  <Users className="h-5 w-5 shrink-0" aria-hidden />
                  <span>Пользователи</span>
                </NavLink>
                <NavLink
                  to="/admin/reports"
                  className={bottomNavLinkClass}
                  onMouseEnter={() => preloadPage("adminReports")}
                  onFocus={() => preloadPage("adminReports")}
                  onTouchStart={() => preloadPage("adminReports")}
                >
                  <ListFilter className="h-5 w-5 shrink-0" aria-hidden />
                  <span>Отчёты</span>
                </NavLink>
              </>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
