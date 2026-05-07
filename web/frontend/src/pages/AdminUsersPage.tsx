import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
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
import type { UserRole } from "../types";

export function AdminUsersPage() {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<"isolator" | "director">("isolator");
  const [editUid, setEditUid] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<"isolator" | "director">("isolator");
  const [version, setVersion] = useState(0);

  const users = useMemo(() => getDemoUsers(), [version]);
  const audit = useMemo(() => getDemoAuditEvents(), [version]);

  function addDemoUser() {
    if (!fullName.trim() || password.length < 6) {
      toast.error("Заполните ФИО и пароль (минимум 6 символов).");
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
      .writeText(`${targetFullName} / ${targetPassword}`)
      .then(() => toast.success("ФИО и пароль скопированы"))
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
    try {
      updateDemoUser(editUid, { fullName: editName, password: editPassword, role: editRole });
      setVersion((v) => v + 1);
      cancelEdit();
      toast.success("Пользователь обновлён");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось обновить пользователя");
    }
  }

  return (
    <div className="page-stack">
      <div className="surface-highlight p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-tight">Пользователи</h2>
        <p className="mt-1 text-sm text-slate-200/95">
          Управление доступом по ФИО и паролю в demo-среде.
        </p>
      </div>
      <div className="divider-fade" />
      {!isFirebaseConfigured ? (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm text-slate-600 theme-dark:text-slate-300">
                Вход в demo только по <strong>ФИО + пароль</strong>. Созданные сотрудники и директора могут входить сразу.
              </p>
              <div className="grid gap-2 md:grid-cols-3">
                <div>
                  <Label htmlFor="demo-fullname">ФИО</Label>
                  <Input
                    id="demo-fullname"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Иванов Иван или Иванов И.И."
                  />
                </div>
                <div>
                  <Label htmlFor="demo-password">Пароль</Label>
                  <Input
                    id="demo-password"
                    type="password"
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
                Добавить demo-пользователя
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-sm text-slate-600 theme-dark:text-slate-300">Учётные записи (ФИО для входа):</p>
              <div className="grid gap-2 text-sm md:grid-cols-2">
                {users.map((user) => (
                  <div key={user.uid} className="surface-muted soft-ring p-3">
                    {editUid === user.uid ? (
                      <div className="space-y-2">
                        <div>
                          <Label htmlFor={`edit-name-${user.uid}`}>ФИО</Label>
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
                          <div className="font-semibold text-primary theme-dark:text-accent">{user.fullName}</div>
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
                            onClick={() => copyCreds(user.fullName, user.password)}
                          >
                            Копировать ФИО и пароль
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
                        пользователь: {item.fullName}
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
        <div className="rounded-xl border border-slate-200 bg-white p-4 theme-dark:border-slate-700 theme-dark:bg-slate-900">
          <p className="text-slate-600 theme-dark:text-slate-300">
            Вход по ФИО и паролю: вызывается Cloud Function <code className="text-xs">loginByFullName</code> (custom
            token). В Firestore в коллекции <code className="text-xs">users</code> нужны поля:{" "}
            <code className="text-xs">fullName</code>, <code className="text-xs">fullNameNormalized</code> (как на
            клиенте в <code className="text-xs">normalizeFullName</code>), <code className="text-xs">passwordHash</code>{" "}
            (bcrypt), <code className="text-xs">role</code>. Документ с id = Firebase Auth <code className="text-xs">uid</code>.
          </p>
          <p className="mt-2 text-xs text-slate-500 theme-dark:text-slate-400">
            Создание пользователей с хэшем пароля — отдельной admin-функцией или скриптом; см.{" "}
            <code className="text-xs">web/firebase/functions</code>.
          </p>
        </div>
      )}
    </div>
  );
}
