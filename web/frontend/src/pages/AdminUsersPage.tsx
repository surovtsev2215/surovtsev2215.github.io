import { useMemo, useState } from "react";
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
import type { UserRole } from "../types";
import { formatFullNameForDisplay, hasPatronymic } from "../lib/normalizeFullName";

export function AdminUsersPage() {
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
  const [remoteRole, setRemoteRole] = useState<"isolator" | "director">("isolator");
  const [remoteLoading, setRemoteLoading] = useState(false);

  const users = useMemo(() => getDemoUsers(), [version]);
  const audit = useMemo(() => getDemoAuditEvents(), [version]);
  const registerByFullNameFn = httpsCallable<
    { fullName: string; password: string; requestedRole?: "isolator" | "director" },
    { uid: string; role: string }
  >(functions, "registerByFullName");

  function addDemoUser() {
    if (!fullName.trim() || password.length < 6) {
      toast.error("Заполните ФамилияИО и пароль (минимум 6 символов).");
      return;
    }
    if (!hasPatronymic(fullName)) {
      toast.error("Укажите ФамилияИО с отчеством (например: ИвановИИ).");
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
    if (!hasPatronymic(editName)) {
      toast.error("Укажите ФамилияИО с отчеством (например: ИвановИИ).");
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
    if (!remoteFullName.trim() || remotePassword.length < 6) {
      toast.error("Заполните ФамилияИО и пароль (минимум 6 символов).");
      return;
    }
    if (!hasPatronymic(remoteFullName)) {
      toast.error("Укажите ФамилияИО с отчеством (например: ИвановИИ).");
      return;
    }
    setRemoteLoading(true);
    try {
      await registerByFullNameFn({
        fullName: remoteFullName.trim(),
        password: remotePassword,
        requestedRole: remoteRole
      });
      setRemoteFullName("");
      setRemotePassword("");
      setRemoteRole("isolator");
      toast.success("Пользователь создан.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось создать пользователя";
      toast.error(message);
    } finally {
      setRemoteLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <div className="surface-highlight p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-tight">Пользователи</h2>
        <p className="mt-1 text-sm text-slate-200/95">
          Управление доступом по ФамилияИО и паролю в demo-среде.
        </p>
      </div>
      <div className="divider-fade" />
      {!isFirebaseConfigured ? (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm text-slate-600 theme-dark:text-slate-300">
                Demo-режим полностью повторяет рабочее управление пользователями.
              </p>
              <p className="text-xs text-slate-500 theme-dark:text-slate-400">
                Отчество обязательно (формат: ФамилияИО, например: ИвановИИ).
              </p>
              <div className="grid gap-2 md:grid-cols-3">
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
                    placeholder="Минимум 6 символов"
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
              <Button type="button" onClick={addDemoUser}>
                Создать demo-пользователя
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm text-slate-600 theme-dark:text-slate-300">Учётные записи (ФамилияИО для входа):</p>
              <div className="grid gap-2 text-sm md:grid-cols-2">
                {users.map((user) => (
                  <div key={user.uid} className="surface-muted soft-ring p-3">
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
                            className={`badge-live rounded-full border px-2 py-0.5 text-xs ${
                              user.role === "admin"
                                ? "border-amber-200 bg-amber-50 text-amber-700 theme-dark:border-amber-700 theme-dark:bg-amber-900/40 theme-dark:text-amber-300"
                                : user.role === "director"
                                  ? "border-violet-200 bg-violet-50 text-violet-700 theme-dark:border-violet-700 theme-dark:bg-violet-900/40 theme-dark:text-violet-300"
                                  : "border-sky-200 bg-sky-50 text-sky-700 theme-dark:border-sky-700 theme-dark:bg-sky-900/40 theme-dark:text-sky-300"
                            }`}
                          >
                            {user.role}
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
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm text-slate-600 theme-dark:text-slate-300">Журнал действий (demo):</p>
              {!audit.length ? (
                <p className="text-xs text-slate-500 theme-dark:text-slate-400">Пока нет записей.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {audit.slice(0, 20).map((item) => (
                    <div key={item.id} className="surface-muted flex items-center justify-between p-2">
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
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm text-slate-600 theme-dark:text-slate-300">
              Создание пользователей в Firebase. По умолчанию роль - изолировщик.
            </p>
            <p className="text-xs text-slate-500 theme-dark:text-slate-400">
              Отчество обязательно (формат: ФамилияИО, например: ИвановИИ).
            </p>
            <div className="grid gap-2 md:grid-cols-3">
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
                  placeholder="Минимум 6 символов"
                />
              </div>
              <div>
                <Label htmlFor="firebase-role">Роль</Label>
                <select
                  id="firebase-role"
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
                  value={remoteRole}
                  onChange={(e) => setRemoteRole(e.target.value === "director" ? "director" : "isolator")}
                >
                  <option value="isolator">Сотрудник (изолировщик)</option>
                  <option value="director">Директор</option>
                </select>
              </div>
            </div>
            <Button type="button" disabled={remoteLoading} onClick={addFirebaseUser}>
              {remoteLoading ? "Создание..." : "Создать пользователя"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
