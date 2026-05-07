import { Suspense, lazy, useEffect } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { Skeleton } from "./components/ui/skeleton";
import type { UserRole } from "./types";

const loadLoginPage = () => import("./pages/LoginPage");
const loadRegisterPage = () => import("./pages/RegisterPage");
const loadFormPage = () => import("./pages/FormPage");
const loadHistoryPage = () => import("./pages/HistoryPage");
const loadAdminDashboardPage = () => import("./pages/AdminDashboardPage");
const loadAdminUsersPage = () => import("./pages/AdminUsersPage");
const loadDirectorOverviewPage = () => import("./pages/DirectorOverviewPage");
const loadDirectorReportsPage = () => import("./pages/DirectorReportsPage");
const loadDirectorProfilePage = () => import("./pages/DirectorProfilePage");
const loadReportDetailPage = () => import("./pages/ReportDetailPage");

const LoginPage = lazy(() => loadLoginPage().then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => loadRegisterPage().then((m) => ({ default: m.RegisterPage })));
const FormPage = lazy(() => loadFormPage().then((m) => ({ default: m.FormPage })));
const HistoryPage = lazy(() => loadHistoryPage().then((m) => ({ default: m.HistoryPage })));
const AdminDashboardPage = lazy(() =>
  loadAdminDashboardPage().then((m) => ({ default: m.AdminDashboardPage }))
);
const AdminUsersPage = lazy(() =>
  loadAdminUsersPage().then((m) => ({ default: m.AdminUsersPage }))
);
const DirectorOverviewPage = lazy(() =>
  loadDirectorOverviewPage().then((m) => ({ default: m.DirectorOverviewPage }))
);
const DirectorReportsPage = lazy(() =>
  loadDirectorReportsPage().then((m) => ({ default: m.DirectorReportsPage }))
);
const DirectorProfilePage = lazy(() =>
  loadDirectorProfilePage().then((m) => ({ default: m.DirectorProfilePage }))
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

function RootRedirect() {
  const { role } = useAuth();
  if (role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
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
        void loadAdminDashboardPage();
        void loadAdminUsersPage();
        return;
      }
      if (role === "director") {
        void loadDirectorOverviewPage();
        void loadDirectorReportsPage();
        void loadDirectorProfilePage();
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
              <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["director"]} />}>
            <Route element={<AppLayout />}>
              <Route path="/director" element={<DirectorOverviewPage />} />
              <Route path="/director/reports" element={<DirectorReportsPage />} />
              <Route path="/director/profile" element={<DirectorProfilePage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
      <Toaster position="top-center" richColors />
    </AuthProvider>
  );
}
