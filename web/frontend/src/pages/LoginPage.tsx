import { FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isFirebaseConfigured } from "../lib/firebase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export function LoginPage() {
  const { user, profile, role, login } = useAuth();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user || profile) {
    const target = role === "admin" ? "/admin/dashboard" : role === "director" ? "/director" : "/form";
    return <Navigate to={target} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(fullName.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа. Проверьте ФИО и пароль.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-3 py-6 sm:px-4 sm:py-8">
      <form
        onSubmit={handleSubmit}
        className="glass soft-ring page-stack w-full max-w-md rounded-2xl p-4 shadow-card sm:p-6"
        noValidate
      >
        <div className="surface-highlight mb-5 p-4">
          <h1 className="text-2xl font-semibold">Система ПТО</h1>
          <p className="mt-1 text-sm text-slate-100/90">Контроль изоляции трубопроводов</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="login-fullname">ФИО</Label>
          <Input
            id="login-fullname"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
            placeholder="Как в списке пользователей, можно без отчества"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="login-password">Пароль</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
            required
          />
        </div>
        {error && (
          <p
            id="login-error"
            className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700 theme-dark:border-red-900 theme-dark:bg-red-950/40 theme-dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Вход..." : "Войти"}
        </Button>
        {isFirebaseConfigured && (
          <p className="text-center text-sm text-slate-600 theme-dark:text-slate-300">
            Нет аккаунта?{" "}
            <Link className="text-primary underline-offset-2 hover:underline" to="/register">
              Зарегистрироваться
            </Link>
          </p>
        )}
        {!isFirebaseConfigured && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 theme-dark:border-slate-700 theme-dark:bg-slate-800/90 theme-dark:text-slate-300">
            Demo: ФИО и пароль из раздела «Пользователи» у админа.
            <br />
            По умолчанию: «Начальник ПТО (Demo)» / admin123 · «Изолировщик (Demo)» / 123456 · «Директор (Demo)» / director123
          </div>
        )}
      </form>
    </div>
  );
}
