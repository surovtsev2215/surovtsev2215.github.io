import { FormEvent, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PasswordInput } from "../components/ui/password-input";
import { Label } from "../components/ui/label";

export function RegisterPage() {
  const { user, profile, role, register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user || profile) {
    const target = role === "admin" ? "/admin/users" : role === "director" ? "/director" : "/form";
    return <Navigate to={target} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }
    if (!password.trim()) {
      setError("Введите пароль.");
      return;
    }
    if (password.length < 2) {
      setError("Пароль должен быть минимум 2 символа.");
      return;
    }
    setLoading(true);
    try {
      await register(fullName.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации.");
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
          <h1 className="text-2xl font-semibold">Регистрация</h1>
          <p className="mt-1 text-sm text-slate-100/90">
            Первый зарегистрированный пользователь станет администратором с расширенными правами.
          </p>
          <div className="mt-3 inline-flex rounded-full border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/95">
            Создание аккаунта
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="register-fullname">ФамилияИО</Label>
          <Input
            id="register-fullname"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "register-error" : undefined}
            placeholder="Для первого входа можно любое имя"
            required
          />
          <p className="text-xs text-slate-500 theme-dark:text-slate-400">Вход и регистрация: ФамилияИО + пароль.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="register-password">Пароль</Label>
          <PasswordInput
            id="register-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "register-error" : undefined}
            placeholder="Придумайте пароль"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="register-confirm-password">Подтверждение пароля</Label>
          <PasswordInput
            id="register-confirm-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "register-error" : undefined}
            required
          />
          <p className="text-xs text-slate-500 theme-dark:text-slate-400">Минимальная длина пароля: 2 символа.</p>
        </div>
        {error && (
          <p
            id="register-error"
            className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700 theme-dark:border-red-900 theme-dark:bg-red-950/40 theme-dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Регистрация..." : "Зарегистрироваться"}
        </Button>
        <p className="text-center text-sm text-slate-600 theme-dark:text-slate-300">
          Уже есть аккаунт?{" "}
          <Link className="text-primary underline-offset-2 hover:underline" to="/login">
            Войти
          </Link>
        </p>
      </form>
    </div>
  );
}
