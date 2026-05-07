import { FormEvent, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export function RegisterPage() {
  const { user, profile, role, register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user || profile) {
    const target = role === "admin" ? "/admin/dashboard" : role === "director" ? "/director" : "/form";
    return <Navigate to={target} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Пароли не совпадают.");
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
    <div className="flex min-h-screen items-center justify-center px-3 py-6 sm:px-4 sm:py-8">
      <form
        onSubmit={handleSubmit}
        className="glass soft-ring page-stack w-full max-w-md rounded-2xl p-4 shadow-card sm:p-6"
        noValidate
      >
        <div className="surface-highlight mb-5 p-4">
          <h1 className="text-2xl font-semibold">Регистрация</h1>
          <p className="mt-1 text-sm text-slate-100/90">Новый пользователь получит роль изолировщика</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="register-fullname">ФИО</Label>
          <Input
            id="register-fullname"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "register-error" : undefined}
            placeholder="Иванов Иван Иванович"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="register-password">Пароль</Label>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "register-error" : undefined}
            placeholder="Минимум 6 символов"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="register-confirm-password">Подтверждение пароля</Label>
          <Input
            id="register-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "register-error" : undefined}
            required
          />
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
