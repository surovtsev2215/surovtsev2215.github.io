import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PasswordInput } from "../components/ui/password-input";
import { Label } from "../components/ui/label";
import { validateFullNameInput, validatePasswordInput } from "../lib/authValidation";

export function LoginPage() {
  const { user, profile, role, login } = useAuth();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user || profile) {
    const target = role === "admin" ? "/admin/users" : role === "director" ? "/director" : "/form";
    return <Navigate to={target} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fullNameError = validateFullNameInput(fullName);
    if (fullNameError) {
      setLoading(false);
      setError(fullNameError);
      return;
    }
    const passwordError = validatePasswordInput(password);
    if (passwordError) {
      setLoading(false);
      setError(passwordError);
      return;
    }
    try {
      await login(fullName.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа. Проверьте ФамилияИО и пароль.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell flex min-h-screen items-center justify-center px-3 py-6 sm:px-4 sm:py-8">
      <form
        onSubmit={handleSubmit}
        className="glass soft-ring page-stack w-full max-w-md rounded-2xl p-4 shadow-card sm:p-6"
        noValidate
      >
        <div className="surface-highlight mb-5 p-4">
          <h1 className="text-2xl font-semibold">Система ПТО</h1>
          <p className="mt-1 text-sm text-slate-100/90">Контроль изоляции трубопроводов</p>
          <div className="mt-3 inline-flex rounded-full border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/95">
            Вход в рабочее пространство
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="login-fullname">ФамилияИО</Label>
          <Input
            id="login-fullname"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
            placeholder="Как в системе: ИвановИИ"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="login-password">Пароль</Label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "login-error" : undefined}
            required
          />
          <p className="text-xs text-slate-500 theme-dark:text-slate-400">
            Пароль: минимум 2 символа. Можно проверить ввод через иконку глаза.
          </p>
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
        <p className="text-center text-xs text-slate-500 theme-dark:text-slate-400">
          Если нужен доступ, обратитесь к администратору.
        </p>
      </form>
    </div>
  );
}
