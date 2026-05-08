import { Link } from "react-router-dom";
import { UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";
import { buildItrAccess, itrSectionMeta } from "../lib/itrAccess";
import { isApiConfigured } from "../lib/runtimeConfig";
import { Label } from "../components/ui/label";
import { PasswordInput } from "../components/ui/password-input";
import { Button } from "../components/ui/button";
import { apiRequest } from "../lib/apiClient";

export function DirectorProfilePage() {
  const { profile } = useAuth();
  const access = buildItrAccess(profile?.position, profile?.allowedSections);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  async function changeOwnPassword() {
    if (!isApiConfigured) {
      toast.error("Смена пароля доступна только в локальном backend-режиме.");
      return;
    }
    if (!currentPassword || !newPassword) {
      toast.error("Введите текущий и новый пароль.");
      return;
    }
    if (newPassword.length < 2) {
      toast.error("Новый пароль должен быть минимум 2 символа.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Подтверждение пароля не совпадает.");
      return;
    }
    setPasswordLoading(true);
    try {
      await apiRequest<void>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Пароль успешно обновлён.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сменить пароль";
      toast.error(message);
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="surface-highlight surface-hero-light animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Профиль ИТР</h2>
            <p className="mt-1 text-sm text-slate-100/90">
              {access.presetTitle}. Доступные инструменты определяются вашей должностью.
            </p>
          </div>
          <UserRound className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      <Card className="soft-ring surface-floating">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div>
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">ФИО</div>
            <div className="text-base font-semibold">
              {profile?.fullName ? formatFullNameForDisplay(profile.fullName) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Должность</div>
            <div className="text-base font-medium">{profile?.position || "Не указана"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Роль</div>
            <div className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 theme-dark:border-violet-700 theme-dark:bg-violet-900/40 theme-dark:text-violet-300">
              ИТР · {access.presetTitle}
            </div>
          </div>
          {(profile?.phone || profile?.telegram) && (
            <div>
              <div className="text-xs text-slate-500 theme-dark:text-slate-400">Контакты</div>
              <div className="space-y-1">
                {profile?.phone ? (
                  <a className="block text-sm text-primary hover:underline theme-dark:text-accent" href={`tel:${profile.phone}`}>
                    {profile.phone}
                  </a>
                ) : null}
                {profile?.telegram ? (
                  <a
                    className="block text-sm text-primary hover:underline theme-dark:text-accent"
                    href={`https://t.me/${String(profile.telegram).replace(/^@/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    @{String(profile.telegram).replace(/^@/, "")}
                  </a>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="soft-ring surface-floating">
        <CardContent className="space-y-3 p-4">
          <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-200">
            Доступные разделы ({access.sections.length})
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {access.sections.map((section) => {
              const meta = itrSectionMeta[section];
              const Icon = meta.icon;
              return (
                <Link
                  key={section}
                  to={meta.to}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm hover:bg-slate-100 theme-dark:border-slate-700 theme-dark:bg-slate-800/60 theme-dark:hover:bg-slate-800"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Icon className="h-4 w-4 text-primary theme-dark:text-accent" aria-hidden />
                    {meta.label}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 theme-dark:text-slate-400">
                    {meta.description}
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="soft-ring surface-floating">
        <CardContent className="space-y-3 p-4">
          <div className="text-sm font-semibold text-slate-700 theme-dark:text-slate-200">Безопасность профиля</div>
          <div className="space-y-1">
            <Label htmlFor="director-current-password">Текущий пароль</Label>
            <PasswordInput
              id="director-current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Введите текущий пароль"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="director-new-password">Новый пароль</Label>
            <PasswordInput
              id="director-new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Минимум 2 символа"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="director-confirm-password">Подтвердите новый пароль</Label>
            <PasswordInput
              id="director-confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Повторите новый пароль"
            />
          </div>
          <Button type="button" className="w-full sm:w-auto" disabled={passwordLoading} onClick={() => void changeOwnPassword()}>
            {passwordLoading ? "Сохранение..." : "Сменить пароль"}
          </Button>
          <p className="text-xs text-slate-500 theme-dark:text-slate-400">
            Текущий пароль можно посмотреть через иконку глаза в поле.
          </p>
        </CardContent>
      </Card>

      {!isApiConfigured && (
        <Card className="soft-ring surface-floating">
          <CardContent className="p-4 text-sm text-slate-600 theme-dark:text-slate-300">
            Расширенный режим ИТР (Команда, Задачи, Согласование) доступен только в локальной версии. Сейчас вам видны
            базовые разделы.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
