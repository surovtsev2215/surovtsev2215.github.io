import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ClipboardList, History, LayoutDashboard, List, UserRound, Users } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

type PreloadTarget =
  | "form"
  | "history"
  | "adminDashboard"
  | "adminUsers"
  | "directorOverview"
  | "directorReports"
  | "directorProfile";

const preloadedTargets = new Set<PreloadTarget>();

function preloadPage(target: PreloadTarget) {
  if (preloadedTargets.has(target)) return;
  preloadedTargets.add(target);
  switch (target) {
    case "form":
      void import("../../pages/FormPage");
      return;
    case "history":
      void import("../../pages/HistoryPage");
      return;
    case "adminDashboard":
      void import("../../pages/AdminDashboardPage");
      return;
    case "adminUsers":
      void import("../../pages/AdminUsersPage");
      return;
    case "directorOverview":
      void import("../../pages/DirectorOverviewPage");
      return;
    case "directorReports":
      void import("../../pages/DirectorReportsPage");
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
  end
}: {
  to: string;
  label: string;
  className: ({ isActive }: { isActive: boolean }) => string;
  preload: PreloadTarget;
  end?: boolean;
}) {
  const prefetch = () => preloadPage(preload);
  return (
    <NavLink
      to={to}
      className={className}
      end={end}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
    >
      {label}
    </NavLink>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-primary text-white"
      : "text-slate-700 hover:bg-slate-100 theme-dark:text-slate-200 theme-dark:hover:bg-slate-800"
  );

const bottomNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-medium transition-colors",
    isActive
      ? "text-primary theme-dark:text-accent"
      : "text-slate-600 theme-dark:text-slate-400"
  );

export function AppLayout() {
  const { role, profile, logout } = useAuth();
  const location = useLocation();
  const isAdmin = role === "admin";
  const isDirector = role === "director";
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

  return (
    <div className="min-h-screen pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="glass sticky top-0 z-20 border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-primary theme-dark:text-accent sm:text-base">
              ПТО · Изоляция
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
                {role === "admin" ? "Админ" : role === "director" ? "Директор" : "Изолировщик"}
              </span>
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
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={toggleTheme}>
              {dark ? "Светлая" : "Тёмная"}
            </Button>
            <span className="hidden max-w-[140px] truncate text-xs text-slate-500 theme-dark:text-slate-400 sm:inline">
              {profile?.fullName ?? "Пользователь"}
            </span>
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
            <Button type="button" variant="outline" size="sm" onClick={() => logout()}>
              Выйти
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-3 px-2 py-2 sm:gap-4 sm:px-4 sm:py-4 md:grid-cols-[230px_1fr]">
        <aside className="glass hidden rounded-xl p-2 shadow-card md:block">
          <nav className="flex flex-col gap-1">
            {!isAdmin && !isDirector && (
              <>
                <PrefetchNavLink
                  to="/form"
                  className={navLinkClass}
                  preload="form"
                  label="Ежедневный отчет"
                />
                <PrefetchNavLink
                  to="/history"
                  className={navLinkClass}
                  preload="history"
                  label="История отчетов"
                />
              </>
            )}
            {isAdmin && (
              <>
                <PrefetchNavLink
                  to="/admin/dashboard"
                  className={navLinkClass}
                  preload="adminDashboard"
                  label="Панель ПТО"
                />
                <PrefetchNavLink
                  to="/admin/users"
                  className={navLinkClass}
                  preload="adminUsers"
                  label="Пользователи"
                />
              </>
            )}
            {isDirector && (
              <>
                <PrefetchNavLink
                  to="/director"
                  className={navLinkClass}
                  preload="directorOverview"
                  label="Сводка"
                  end
                />
                <PrefetchNavLink
                  to="/director/reports"
                  className={navLinkClass}
                  preload="directorReports"
                  label="Отчёты"
                />
                <PrefetchNavLink
                  to="/director/profile"
                  className={navLinkClass}
                  preload="directorProfile"
                  label="Профиль"
                />
              </>
            )}
          </nav>
        </aside>

        <main className="glass rounded-xl p-2.5 pb-24 shadow-card sm:p-4 md:pb-4">
          <Suspense
            fallback={
              <div className="space-y-3">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            }
          >
            <div key={location.pathname} className="route-transition">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>

      <nav
        className="glass fixed bottom-0 left-0 right-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Основная навигация"
      >
        <div className="mx-auto flex max-w-6xl px-2 pb-2 pt-1.5">
          {!isAdmin && !isDirector && (
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
                to="/admin/dashboard"
                className={bottomNavLinkClass}
                onMouseEnter={() => preloadPage("adminDashboard")}
                onFocus={() => preloadPage("adminDashboard")}
                onTouchStart={() => preloadPage("adminDashboard")}
              >
                <LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden />
                <span>Панель</span>
              </NavLink>
              <NavLink
                to="/admin/users"
                className={bottomNavLinkClass}
                onMouseEnter={() => preloadPage("adminUsers")}
                onFocus={() => preloadPage("adminUsers")}
                onTouchStart={() => preloadPage("adminUsers")}
              >
                <Users className="h-5 w-5 shrink-0" aria-hidden />
                <span>Люди</span>
              </NavLink>
            </>
          )}
          {isDirector && (
            <>
              <NavLink
                to="/director"
                end
                className={bottomNavLinkClass}
                onMouseEnter={() => preloadPage("directorOverview")}
                onFocus={() => preloadPage("directorOverview")}
                onTouchStart={() => preloadPage("directorOverview")}
              >
                <LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden />
                <span>Сводка</span>
              </NavLink>
              <NavLink
                to="/director/reports"
                className={bottomNavLinkClass}
                onMouseEnter={() => preloadPage("directorReports")}
                onFocus={() => preloadPage("directorReports")}
                onTouchStart={() => preloadPage("directorReports")}
              >
                <List className="h-5 w-5 shrink-0" aria-hidden />
                <span>Отчёты</span>
              </NavLink>
              <NavLink
                to="/director/profile"
                className={bottomNavLinkClass}
                onMouseEnter={() => preloadPage("directorProfile")}
                onFocus={() => preloadPage("directorProfile")}
                onTouchStart={() => preloadPage("directorProfile")}
              >
                <UserRound className="h-5 w-5 shrink-0" aria-hidden />
                <span>Профиль</span>
              </NavLink>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
