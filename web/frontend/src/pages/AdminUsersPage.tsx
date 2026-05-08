import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { httpsCallable } from "firebase/functions";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { PasswordInput } from "../components/ui/password-input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import {
  createDemoStaffUser,
  getDemoAuditEvents,
  getDemoUsers,
  removeDemoUser,
  updateDemoUser
} from "../lib/demoUsers";
import { isFirebaseConfigured } from "../lib/firebase";
import { functions } from "../lib/firebase";
import { apiRequest } from "../lib/apiClient";
import { isApiConfigured } from "../lib/runtimeConfig";
import type { ItrSection, Profile, UserRole } from "../types";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";
import { POSITION_OPTIONS } from "../lib/positions";
import { useAuth } from "../contexts/AuthContext";
import { ALL_ITR_SECTIONS, itrSectionMeta } from "../lib/itrAccess";

export function AdminUsersPage() {
  const { profile } = useAuth();
  const positionOptions = POSITION_OPTIONS;
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"isolator" | "director">("isolator");
  const [editUid, setEditUid] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<"isolator" | "director">("isolator");
  const [version, setVersion] = useState(0);
  const [remoteFullName, setRemoteFullName] = useState("");
  const [remotePassword, setRemotePassword] = useState("");
  const [remotePosition, setRemotePosition] = useState("");
  const [remoteRole, setRemoteRole] = useState<"isolator" | "director">("isolator");
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [apiEditUid, setApiEditUid] = useState<string | null>(null);
  const [apiEditFullName, setApiEditFullName] = useState("");
  const [apiEditPosition, setApiEditPosition] = useState("");
  const [apiEditRole, setApiEditRole] = useState<"isolator" | "director">("isolator");
  const [apiEditAllowedSections, setApiEditAllowedSections] = useState<ItrSection[]>(ALL_ITR_SECTIONS);
  const [apiEditPassword, setApiEditPassword] = useState("");
  const [apiEditLoading, setApiEditLoading] = useState(false);
  const [apiUsers, setApiUsers] = useState<Profile[]>([]);
  const [apiUsersLoading, setApiUsersLoading] = useState(false);
  const [showPositionFilter, setShowPositionFilter] = useState(false);
  const [positionFilter, setPositionFilter] = useState("");
  const [adminCurrentPassword, setAdminCurrentPassword] = useState("");
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [adminConfirmPassword, setAdminConfirmPassword] = useState("");
  const [adminPasswordLoading, setAdminPasswordLoading] = useState(false);

  const users = useMemo(() => getDemoUsers(), [version]);
  const audit = useMemo(() => getDemoAuditEvents(), [version]);
  const registerByFullNameFn = httpsCallable<
    { fullName: string; password: string; requestedRole?: "isolator" | "director"; requestedPosition?: string },
    { uid: string; role: string }
  >(functions, "registerByFullName");

  function roleFromPosition(position: string): "isolator" | "director" {
    return position === "Начальник участка" || position === "Руководитель проекта" ? "director" : "isolator";
  }

  function roleLabel(role: UserRole): string {
    if (role === "admin") return "Админ";
    if (role === "director") return "ИТР";
    return "Изолировщик";
  }

  function roleBadgeClass(role: UserRole): string {
    if (role === "admin") {
      return "border-amber-200 bg-amber-50 text-amber-700 theme-dark:border-amber-700 theme-dark:bg-amber-900/40 theme-dark:text-amber-300";
    }
    if (role === "director") {
      return "border-violet-200 bg-violet-50 text-violet-700 theme-dark:border-violet-700 theme-dark:bg-violet-900/40 theme-dark:text-violet-300";
    }
    return "border-sky-200 bg-sky-50 text-sky-700 theme-dark:border-sky-700 theme-dark:bg-sky-900/40 theme-dark:text-sky-300";
  }

  const statsUsers = useMemo(
    () => (isFirebaseConfigured ? apiUsers : (users as Array<{ role: UserRole; position?: string }>)),
    [apiUsers, users]
  );
  const totalUsers = statsUsers.length;
  const directorsCount = statsUsers.filter((u) => u.role === "director").length;
  const isolatorsCount = statsUsers.filter((u) => u.role === "isolator").length;
  const filteredApiUsers = useMemo(() => {
    if (!positionFilter.trim()) return apiUsers;
    return apiUsers.filter((u) => (u.position || "").trim() === positionFilter);
  }, [apiUsers, positionFilter]);

  useEffect(() => {
    if (!isApiConfigured) return;
    void loadApiUsers();
  }, []);

  async function loadApiUsers() {
    setApiUsersLoading(true);
    try {
      const { users: rows } = await apiRequest<{ users: Profile[] }>("/api/admin/users");
      setApiUsers(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось загрузить пользователей");
    } finally {
      setApiUsersLoading(false);
    }
  }

  function addDemoUser() {
    if (!fullName.trim() || password.length < 2) {
      toast.error("Заполните ФамилияИО и пароль (минимум 2 символа).");
      return;
    }
    try {
      createDemoStaffUser({ fullName, password, role: newRole });
      setFullName("");
      setPassword("");
      setNewRole("isolator");
      setVersion((v) => v + 1);
      toast.success(`Demo-${newRole === "director" ? "директор" : "сотрудник"} создан.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось создать пользователя");
    }
  }

  function copyCreds(targetFullName: string, targetPassword: string) {
    void navigator.clipboard
      .writeText(`${formatFullNameForDisplay(targetFullName)} / ${targetPassword}`)
      .then(() => toast.success("ФамилияИО и пароль скопированы"))
      .catch(() => toast.error("Не удалось скопировать данные"));
  }

  function deleteUser(uid: string) {
    const ok = window.confirm("Удалить demo-пользователя? Это действие нельзя отменить.");
    if (!ok) return;
    try {
      removeDemoUser(uid);
      setVersion((v) => v + 1);
      toast.success("Пользователь удалён");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить пользователя");
    }
  }

  function beginEdit(uid: string, currentName: string, currentPassword: string, currentRole: UserRole) {
    setEditUid(uid);
    setEditName(currentName);
    setEditPassword(currentPassword);
    setEditRole(currentRole === "director" ? "director" : "isolator");
  }

  function cancelEdit() {
    setEditUid(null);
    setEditName("");
    setEditPassword("");
    setEditRole("isolator");
  }

  function saveEdit() {
    if (!editUid) return;
    if (editPassword.length < 2) {
      toast.error("Пароль должен быть минимум 2 символа.");
      return;
    }
    try {
      updateDemoUser(editUid, { fullName: editName, password: editPassword, role: editRole });
      setVersion((v) => v + 1);
      cancelEdit();
      toast.success("Пользователь обновлён");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось обновить пользователя");
    }
  }

  async function addFirebaseUser() {
    if (!remoteFullName.trim() || remotePassword.length < 2) {
      toast.error("Заполните ФамилияИО и пароль (минимум 2 символа).");
      return;
    }
    if (!remotePosition.trim()) {
      toast.error("Выберите должность из списка.");
      return;
    }
    setRemoteLoading(true);
    try {
      if (isApiConfigured) {
        await apiRequest<{ profile: { uid: string } }>("/api/admin/users", {
          method: "POST",
          body: JSON.stringify({
            fullName: remoteFullName.trim(),
            password: remotePassword,
            requestedRole: remoteRole,
            requestedPosition: remotePosition.trim()
          })
        });
      } else {
        await registerByFullNameFn({
          fullName: remoteFullName.trim(),
          password: remotePassword,
          requestedRole: remoteRole,
          requestedPosition: remotePosition.trim()
        });
      }
      setRemoteFullName("");
      setRemotePassword("");
      setRemotePosition("");
      setRemoteRole("isolator");
      if (isApiConfigured) {
        await loadApiUsers();
      }
      toast.success("Пользователь создан.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось создать пользователя";
      toast.error(message);
    } finally {
      setRemoteLoading(false);
    }
  }

  function beginApiEdit(user: Profile) {
    const resolvedAllowedSections =
      Array.isArray(user.allowedSections) && user.allowedSections.length > 0
        ? ALL_ITR_SECTIONS.filter((section) => user.allowedSections?.includes(section))
        : ALL_ITR_SECTIONS;
    setApiEditUid(user.uid);
    setApiEditFullName(user.fullName || "");
    setApiEditPosition(user.position || "");
    setApiEditRole(user.role === "director" ? "director" : "isolator");
    setApiEditAllowedSections(resolvedAllowedSections);
    setApiEditPassword("");
  }

  function cancelApiEdit() {
    setApiEditUid(null);
    setApiEditFullName("");
    setApiEditPosition("");
    setApiEditRole("isolator");
    setApiEditAllowedSections(ALL_ITR_SECTIONS);
    setApiEditPassword("");
  }

  function toggleApiEditSection(section: ItrSection) {
    setApiEditAllowedSections((prev) => {
      if (prev.includes(section)) {
        return prev.filter((item) => item !== section);
      }
      const merged = [...prev, section];
      return ALL_ITR_SECTIONS.filter((item) => merged.includes(item));
    });
  }

  async function saveApiEdit() {
    if (!apiEditUid) return;
    if (!apiEditFullName.trim()) {
      toast.error("Укажите ФамилияИО.");
      return;
    }
    if (!apiEditPosition.trim()) {
      toast.error("Выберите должность.");
      return;
    }
    if (apiEditPassword && apiEditPassword.length < 2) {
      toast.error("Новый пароль должен быть минимум 2 символа.");
      return;
    }
    if (apiEditRole === "director" && apiEditAllowedSections.length === 0) {
      toast.error("Для ИТР выберите хотя бы одну вкладку.");
      return;
    }
    setApiEditLoading(true);
    try {
      await apiRequest<{ profile: Profile }>(`/api/admin/users/${apiEditUid}`, {
        method: "PUT",
        body: JSON.stringify({
          fullName: apiEditFullName.trim(),
          requestedPosition: apiEditPosition.trim(),
          requestedRole: apiEditRole,
          allowedSections: apiEditRole === "director" ? apiEditAllowedSections : [],
          password: apiEditPassword
        })
      });
      await loadApiUsers();
      cancelApiEdit();
      toast.success("Пользователь обновлён.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить пользователя";
      toast.error(message);
    } finally {
      setApiEditLoading(false);
    }
  }

  async function removeApiUser(user: Profile) {
    const ok = window.confirm(`Удалить пользователя ${formatFullNameForDisplay(user.fullName)}? Это действие нельзя отменить.`);
    if (!ok) return;
    try {
      await apiRequest<void>(`/api/admin/users/${user.uid}`, { method: "DELETE" });
      if (apiEditUid === user.uid) {
        cancelApiEdit();
      }
      await loadApiUsers();
      toast.success("Пользователь удалён.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось удалить пользователя";
      toast.error(message);
    }
  }

  async function changeOwnAdminPassword() {
    if (!isApiConfigured) {
      toast.error("Смена пароля доступна только в локальном backend-режиме.");
      return;
    }
    if (!adminCurrentPassword || !adminNewPassword) {
      toast.error("Введите текущий и новый пароль.");
      return;
    }
    if (adminNewPassword.length < 2) {
      toast.error("Новый пароль должен быть минимум 2 символа.");
      return;
    }
    if (adminNewPassword !== adminConfirmPassword) {
      toast.error("Подтверждение пароля не совпадает.");
      return;
    }
    setAdminPasswordLoading(true);
    try {
      await apiRequest<void>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: adminCurrentPassword,
          newPassword: adminNewPassword
        })
      });
      setAdminCurrentPassword("");
      setAdminNewPassword("");
      setAdminConfirmPassword("");
      toast.success("Пароль администратора обновлён.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сменить пароль";
      toast.error(message);
    } finally {
      setAdminPasswordLoading(false);
    }
  }

  return (
    <div className="page-stack mx-auto w-full max-w-6xl">
      <div className="surface-highlight p-4 sm:p-5">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Пользователи</h2>
          <div className="mx-auto mt-2 h-1 w-20 rounded-full bg-white/70" />
        </div>
      </div>
      <div className="divider-fade" />
      <Card className="soft-ring surface-floating">
        <CardContent className="grid gap-3 p-3 md:grid-cols-3 sm:p-4">
          <div className="surface-muted rounded-xl border border-slate-200/70 p-3 theme-dark:border-slate-700/80">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Всего сотрудников</div>
            <div className="mt-1 text-xl font-semibold">{totalUsers}</div>
          </div>
          <div className="surface-muted rounded-xl border border-slate-200/70 p-3 theme-dark:border-slate-700/80">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">Изолировщики</div>
            <div className="mt-1 text-xl font-semibold">{isolatorsCount}</div>
          </div>
          <div className="surface-muted rounded-xl border border-slate-200/70 p-3 theme-dark:border-slate-700/80">
            <div className="text-xs text-slate-500 theme-dark:text-slate-400">ИТР</div>
            <div className="mt-1 text-xl font-semibold">{directorsCount}</div>
          </div>
        </CardContent>
      </Card>
      {profile?.role === "admin" && isApiConfigured && (
        <Card className="soft-ring surface-floating">
          <CardContent className="space-y-3 p-4">
            <div>
              <h3 className="text-base font-semibold">Смена пароля администратора</h3>
              <p className="text-xs text-slate-500 theme-dark:text-slate-400">
                Меняет пароль вашей текущей админ-учётной записи.
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div>
                <Label htmlFor="admin-current-password">Текущий пароль</Label>
                <PasswordInput
                  id="admin-current-password"
                  value={adminCurrentPassword}
                  onChange={(e) => setAdminCurrentPassword(e.target.value)}
                  placeholder="Введите текущий пароль"
                />
              </div>
              <div>
                <Label htmlFor="admin-new-password">Новый пароль</Label>
                <PasswordInput
                  id="admin-new-password"
                  value={adminNewPassword}
                  onChange={(e) => setAdminNewPassword(e.target.value)}
                  placeholder="Минимум 2 символа"
                />
              </div>
              <div>
                <Label htmlFor="admin-confirm-password">Подтвердите пароль</Label>
                <PasswordInput
                  id="admin-confirm-password"
                  value={adminConfirmPassword}
                  onChange={(e) => setAdminConfirmPassword(e.target.value)}
                  placeholder="Повторите новый пароль"
                />
              </div>
            </div>
            <div>
              <Button type="button" disabled={adminPasswordLoading} onClick={() => void changeOwnAdminPassword()}>
                {adminPasswordLoading ? "Сохраняем..." : "Сменить мой пароль"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {!isFirebaseConfigured ? (
        <>
          <div className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
            <Card className="soft-ring surface-floating xl:sticky xl:top-4 xl:self-start">
              <CardContent className="space-y-3 p-4">
                <div>
                  <h3 className="text-base font-semibold">Создание пользователя</h3>
                  <p className="text-xs text-slate-500 theme-dark:text-slate-400">
                    Локальный режим. Вход: ФамилияИО + пароль от 4 символов.
                  </p>
                </div>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="demo-fullname">ФамилияИО</Label>
                    <Input
                      id="demo-fullname"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="ИвановИИ"
                    />
                  </div>
                  <div>
                    <Label htmlFor="demo-password">Пароль</Label>
                    <PasswordInput
                      id="demo-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Минимум 2 символа"
                    />
                  </div>
                  <div>
                    <Label htmlFor="demo-role">Роль</Label>
                    <select
                      id="demo-role"
                      className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value === "director" ? "director" : "isolator")}
                    >
                      <option value="isolator">Сотрудник (изолировщик)</option>
                      <option value="director">Директор</option>
                    </select>
                  </div>
                </div>
                <Button type="button" className="w-full" onClick={addDemoUser}>
                  Создать пользователя
                </Button>
              </CardContent>
            </Card>

            <Card className="soft-ring surface-floating">
              <CardContent className="p-4">
                <p className="mb-3 text-sm font-medium text-slate-700 theme-dark:text-slate-200">Учётные записи</p>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                {users.map((user) => (
                  <div key={user.uid} className="pretty-list-item surface-muted soft-ring p-3">
                    {editUid === user.uid ? (
                      <div className="space-y-2">
                        <div>
                          <Label htmlFor={`edit-name-${user.uid}`}>ФамилияИО</Label>
                          <Input
                            id={`edit-name-${user.uid}`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`edit-password-${user.uid}`}>Пароль</Label>
                          <Input
                            id={`edit-password-${user.uid}`}
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                          />
                        </div>
                        {user.role !== "admin" && (
                          <div>
                            <Label htmlFor={`edit-role-${user.uid}`}>Роль</Label>
                            <select
                              id={`edit-role-${user.uid}`}
                              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value === "director" ? "director" : "isolator")}
                            >
                              <option value="isolator">Сотрудник (изолировщик)</option>
                              <option value="director">Директор</option>
                            </select>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" onClick={saveEdit}>
                            Сохранить
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                            Отмена
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-primary theme-dark:text-accent">{formatFullNameForDisplay(user.fullName)}</div>
                          <span
                            className={`badge-live rounded-full border px-2 py-0.5 text-xs ${roleBadgeClass(user.role)}`}
                          >
                            {roleLabel(user.role)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500 theme-dark:text-slate-400">
                          Служебный email в отчётах: {user.email}
                        </div>
                        <div>Пароль: {user.password}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => copyCreds(formatFullNameForDisplay(user.fullName), user.password)}
                          >
                            Копировать ФамилияИО и пароль
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => beginEdit(user.uid, user.fullName, user.password, user.role)}
                          >
                            Редактировать
                          </Button>
                          {user.role !== "admin" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto"
                              onClick={() => deleteUser(user.uid)}
                            >
                              Удалить
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="soft-ring surface-floating">
            <CardContent className="p-4">
              <p className="mb-2 text-sm text-slate-600 theme-dark:text-slate-300">Журнал действий:</p>
              {!audit.length ? (
                <p className="text-xs text-slate-500 theme-dark:text-slate-400">Пока нет записей.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {audit.slice(0, 20).map((item) => (
                    <div key={item.id} className="pretty-list-item surface-muted flex items-center justify-between p-2">
                      <span>
                        {item.action === "create"
                          ? "Создан"
                          : item.action === "update"
                            ? "Обновлён"
                            : "Удалён"}{" "}
                        пользователь: {formatFullNameForDisplay(item.fullName)}
                      </span>
                      <span className="text-slate-500 theme-dark:text-slate-400">
                        {new Date(item.at).toLocaleString("ru-RU")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
            <Card className="soft-ring surface-floating xl:sticky xl:top-4 xl:self-start">
              <CardContent className="space-y-3 p-4">
                <div>
                  <h3 className="text-base font-semibold">Создание пользователя</h3>
                  <p className="text-xs text-slate-500 theme-dark:text-slate-400">
                    {isApiConfigured
                      ? "Через собственный backend. Роль определяется по должности."
                      : "Через Firebase. Роль определяется по должности."}
                  </p>
                </div>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="firebase-fullname">ФамилияИО</Label>
                    <Input
                      id="firebase-fullname"
                      value={remoteFullName}
                      onChange={(e) => setRemoteFullName(e.target.value)}
                      placeholder="ИвановИИ"
                    />
                  </div>
                  <div>
                    <Label htmlFor="firebase-password">Пароль</Label>
                    <PasswordInput
                      id="firebase-password"
                      value={remotePassword}
                      onChange={(e) => setRemotePassword(e.target.value)}
                      placeholder="Минимум 2 символа"
                    />
                  </div>
                  <div>
                    <Label htmlFor="firebase-position">Должность</Label>
                    <select
                      id="firebase-position"
                      className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
                      value={remotePosition}
                      onChange={(e) => setRemotePosition(e.target.value)}
                    >
                      <option value="">Выберите должность</option>
                      {positionOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="firebase-role">Роль</Label>
                    <select
                      id="firebase-role"
                      className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
                      value={remoteRole}
                      onChange={(e) => setRemoteRole(e.target.value === "director" ? "director" : "isolator")}
                    >
                      <option value="isolator">Изолировщик</option>
                      <option value="director">ИТР</option>
                    </select>
                  </div>
                </div>
                <Button type="button" className="w-full" disabled={remoteLoading} onClick={addFirebaseUser}>
                  {remoteLoading ? "Создание..." : "Создать пользователя"}
                </Button>
              </CardContent>
            </Card>
            <Card className="soft-ring surface-floating">
              <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm text-slate-600 theme-dark:text-slate-300">Пользователи (online)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowPositionFilter((v) => !v)}>
                    Фильтр по должности
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadApiUsers()}>
                    Обновить
                  </Button>
                </div>
              </div>
              {showPositionFilter && (
                <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <select
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                  >
                    <option value="">Все должности</option>
                    {positionOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setPositionFilter("")}>
                    Сбросить
                  </Button>
                </div>
              )}
              {apiUsersLoading ? (
                <p className="text-xs text-slate-500 theme-dark:text-slate-400">Загрузка...</p>
              ) : !filteredApiUsers.length ? (
                <p className="text-xs text-slate-500 theme-dark:text-slate-400">Пока нет записей.</p>
              ) : (
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  {filteredApiUsers.map((user) => (
                    <div key={user.uid} className="pretty-list-item surface-muted soft-ring p-3">
                      {apiEditUid === user.uid ? (
                        <div className="space-y-2">
                          <div>
                            <Label htmlFor={`api-edit-name-${user.uid}`}>ФамилияИО</Label>
                            <Input
                              id={`api-edit-name-${user.uid}`}
                              value={apiEditFullName}
                              onChange={(e) => setApiEditFullName(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`api-edit-position-${user.uid}`}>Должность</Label>
                            <select
                              id={`api-edit-position-${user.uid}`}
                              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
                              value={apiEditPosition}
                              onChange={(e) => setApiEditPosition(e.target.value)}
                            >
                              <option value="">Выберите должность</option>
                              {positionOptions.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label htmlFor={`api-edit-password-${user.uid}`}>Новый пароль (необязательно)</Label>
                            <PasswordInput
                              id={`api-edit-password-${user.uid}`}
                              value={apiEditPassword}
                              onChange={(e) => setApiEditPassword(e.target.value)}
                              placeholder="Оставьте пустым, чтобы не менять"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`api-edit-role-${user.uid}`}>Роль доступа</Label>
                            <select
                              id={`api-edit-role-${user.uid}`}
                              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
                              value={apiEditRole}
                              onChange={(e) => setApiEditRole(e.target.value === "director" ? "director" : "isolator")}
                            >
                              <option value="isolator">Изолировщик</option>
                              <option value="director">ИТР</option>
                            </select>
                          </div>
                          {apiEditRole === "director" ? (
                            <div>
                              <Label>Доступ к вкладкам ИТР</Label>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {ALL_ITR_SECTIONS.map((section) => (
                                  <label
                                    key={section}
                                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 theme-dark:border-slate-600"
                                      checked={apiEditAllowedSections.includes(section)}
                                      onChange={() => toggleApiEditSection(section)}
                                    />
                                    <span>{itrSectionMeta[section].label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" disabled={apiEditLoading} onClick={() => void saveApiEdit()}>
                              {apiEditLoading ? "Сохранение..." : "Сохранить"}
                            </Button>
                            <Button type="button" variant="secondary" size="sm" disabled={apiEditLoading} onClick={cancelApiEdit}>
                              Отмена
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-primary theme-dark:text-accent">
                              {formatFullNameForDisplay(user.fullName)}
                            </div>
                            <span
                              className={`badge-live rounded-full border px-2 py-0.5 text-xs ${roleBadgeClass(user.role)}`}
                            >
                              {roleLabel(user.role)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500 theme-dark:text-slate-400">
                            Служебный email: {user.email}
                          </div>
                          {user.position && (
                            <div className="text-xs text-slate-600 theme-dark:text-slate-300">Должность: {user.position}</div>
                          )}
                          {user.role !== "admin" && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => beginApiEdit(user)}>
                                Редактировать
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => void removeApiUser(user)}>
                                Удалить
                              </Button>
                            </div>
                          )}
                        
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
