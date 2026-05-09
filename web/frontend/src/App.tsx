import { Suspense, lazy, useEffect } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { Skeleton } from "./components/ui/skeleton";
import { buildItrAccess, type ItrSection } from "./lib/itrAccess";
import type { UserRole } from "./types";

const loadLoginPage = () => import("./pages/LoginPage");
const loadRegisterPage = () => import("./pages/RegisterPage");
const loadFormPage = () => import("./pages/FormPage");
const loadHistoryPage = () => import("./pages/HistoryPage");
const loadAdminUsersPage = () => import("./pages/AdminUsersPage");
const loadDirectorHomePage = () => import("./pages/DirectorHomePage");
const loadDirectorWorkspacePage = () => import("./pages/DirectorWorkspacePage");
const loadDirectorReportsPage = () => import("./pages/DirectorReportsPage");
const loadDirectorTeamPage = () => import("./pages/DirectorTeamPage");
const loadDirectorTasksPage = () => import("./pages/DirectorTasksPage");
const loadDirectorAnalyticsPage = () => import("./pages/DirectorAnalyticsPage");
const loadDirectorApprovalsPage = () => import("./pages/DirectorApprovalsPage");
const loadDirectorProfilePage = () => import("./pages/DirectorProfilePage");
const loadReportDetailPage = () => import("./pages/ReportDetailPage");

const LoginPage = lazy(() => loadLoginPage().then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => loadRegisterPage().then((m) => ({ default: m.RegisterPage })));
const FormPage = lazy(() => loadFormPage().then((m) => ({ default: m.FormPage })));
const HistoryPage = lazy(() => loadHistoryPage().then((m) => ({ default: m.HistoryPage })));
const AdminUsersPage = lazy(() =>
  loadAdminUsersPage().then((m) => ({ default: m.AdminUsersPage }))
);
const DirectorWorkspacePage = lazy(() =>
  loadDirectorWorkspacePage().then((m) => ({ default: m.DirectorWorkspacePage }))
);
const ReportDetailPage = lazy(() =>
  loadReportDetailPage().then((m) => ({ default: m.ReportDetailPage }))
);

function AuthLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-slate-100 p-6 theme-dark:bg-slate-950">
      <div className="mx-auto max-w-md space-y-4 pt-20">
        <Skeleton className="mx-auto h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

function ProtectedRoute({ allowedRoles }: { allowedRoles?: UserRole[] }) {
  const { user, profile, role, loading } = useAuth();

  if (loading) {
    return <AuthLoadingSkeleton />;
  }

  if (!user && !profile) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles?.length && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function ItrLegacyRedirect({ section }: { section: ItrSection }) {
  if (section === "home") return <Navigate to="/director" replace />;
  return <Navigate to={`/director?section=${section}`} replace />;
}

function RootRedirect() {
  const { role } = useAuth();
  if (role === "admin") {
    return <Navigate to="/admin/users" replace />;
  }
  if (role === "director") {
    return <Navigate to="/director" replace />;
  }
  return <Navigate to="/form" replace />;
}

function RoutePrefetcher() {
  const { role, user, profile } = useAuth();

  useEffect(() => {
    if (!user && !profile) return;
    const run = () => {
      void loadRegisterPage();
      void loadReportDetailPage();
      if (role === "admin") {
        void loadAdminUsersPage();
        return;
      }
      if (role === "director") {
        void loadDirectorWorkspacePage();
        const access = buildItrAccess(profile?.position, profile?.allowedSections);
        // Keep startup light: prefetch only first critical sections.
        for (const section of access.sections.slice(0, 2)) {
          if (section === "home") void loadDirectorHomePage();
          if (section === "reports") void loadDirectorReportsPage();
          if (section === "team") void loadDirectorTeamPage();
          if (section === "tasks") void loadDirectorTasksPage();
          if (section === "analytics") void loadDirectorAnalyticsPage();
          if (section === "approvals") void loadDirectorApprovalsPage();
          if (section === "profile") void loadDirectorProfilePage();
        }
        return;
      }
      void loadFormPage();
      void loadHistoryPage();
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }

    const timeoutId = setTimeout(run, 300);
    return () => clearTimeout(timeoutId);
  }, [role, user, profile]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <RoutePrefetcher />
      <Suspense fallback={<AuthLoadingSkeleton />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute allowedRoles={["isolator"]} />}>
            <Route element={<AppLayout />}>
              <Route path="/form" element={<FormPage />} />
              <Route path="/history" element={<HistoryPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/report/:id" element={<ReportDetailPage />} />
              <Route path="/" element={<RootRedirect />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route element={<AppLayout />}>
              <Route path="/admin/dashboard" element={<Navigate to="/admin/users" replace />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["director"]} />}>
            <Route element={<AppLayout />}>
              <Route path="/director" element={<DirectorWorkspacePage />} />
              <Route path="/director/reports" element={<ItrLegacyRedirect section="reports" />} />
              <Route path="/director/team" element={<ItrLegacyRedirect section="team" />} />
              <Route path="/director/tasks" element={<ItrLegacyRedirect section="tasks" />} />
              <Route path="/director/analytics" element={<ItrLegacyRedirect section="analytics" />} />
              <Route path="/director/approvals" element={<ItrLegacyRedirect section="approvals" />} />
              <Route path="/director/profile" element={<ItrLegacyRedirect section="profile" />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
      <Toaster position="top-center" richColors />
    </AuthProvider>
  );
}
