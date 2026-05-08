import type { UserRole } from "../types";
import { formatFullNameForDisplay, normalizeFullName } from "./normalizeFullName";
import { syntheticEmailForUid } from "./syntheticUserEmail";

export interface DemoUser {
  uid: string;
  role: UserRole;
  fullName: string;
  /** Служебное поле для отчётов; не логин. */
  email: string;
  password: string;
}

export interface DemoAuditEvent {
  id: string;
  at: number;
  action: "create" | "update" | "delete";
  uid: string;
  fullName: string;
}

const KEY = "pto-demo-users";
const AUDIT_KEY = "pto-demo-users-audit";

const adminOnlyUser: DemoUser = {
  uid: "demo-admin",
  role: "admin",
  fullName: "admin",
  email: syntheticEmailForUid("demo-admin"),
  password: "3001"
};
const defaultUsers: DemoUser[] = [adminOnlyUser];

function migrateRawList(raw: unknown): DemoUser[] {
  if (!Array.isArray(raw)) return defaultUsers;
  const normalized: DemoUser[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<DemoUser>;
    const fullName = formatFullNameForDisplay(String(candidate.fullName ?? ""));
    const password = String(candidate.password ?? "");
    const uid = String(candidate.uid ?? "").trim() || `demo-${crypto.randomUUID()}`;
    if (!fullName || password.length < 1) continue;
    const role: UserRole =
      candidate.role === "admin" || candidate.role === "director" || candidate.role === "isolator"
        ? candidate.role
        : "isolator";
    normalized.push({
      uid,
      role,
      fullName,
      email: String(candidate.email ?? "").trim() || syntheticEmailForUid(uid),
      password
    });
  }
  if (!normalized.some((u) => u.uid === "demo-admin" || normalizeFullName(u.fullName) === "admin")) {
    normalized.unshift(adminOnlyUser);
  }
  const byUid = new Map<string, DemoUser>();
  for (const user of normalized) {
    byUid.set(user.uid, user);
  }
  return Array.from(byUid.values());
}

export function getDemoUsers(): DemoUser[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(defaultUsers));
      return defaultUsers;
    }
    const parsed = JSON.parse(raw) as unknown;
    const migrated = migrateRawList(parsed);
    localStorage.setItem(KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return defaultUsers;
  }
}

export function saveDemoUsers(users: DemoUser[]) {
  localStorage.setItem(KEY, JSON.stringify(users));
}

function appendAudit(event: Omit<DemoAuditEvent, "id" | "at">) {
  const items = getDemoAuditEvents();
  items.unshift({
    id: crypto.randomUUID(),
    at: Date.now(),
    ...event
  });
  localStorage.setItem(AUDIT_KEY, JSON.stringify(items.slice(0, 200)));
}

export function getDemoAuditEvents(): DemoAuditEvent[] {
  try {
    return (JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]") as DemoAuditEvent[]).sort(
      (a, b) => b.at - a.at
    );
  } catch {
    return [];
  }
}

export function createDemoStaffUser(input: { fullName: string; password: string; role: "isolator" | "director" }) {
  const fullName = formatFullNameForDisplay(input.fullName);
  if (!fullName) throw new Error("Введите ФамилияИО.");
  if (input.password.length < 2) throw new Error("Пароль должен быть не короче 2 символов.");
  const norm = normalizeFullName(fullName);
  const users = getDemoUsers();
  if (users.some((u) => normalizeFullName(u.fullName) === norm)) {
    throw new Error("Пользователь с таким ФамилияИО уже существует.");
  }
  const uid = `demo-${crypto.randomUUID()}`;
  const created: DemoUser = {
    uid,
    role: input.role,
    fullName,
    email: syntheticEmailForUid(uid),
    password: input.password
  };
  saveDemoUsers([created, ...users]);
  appendAudit({ action: "create", uid: created.uid, fullName: created.fullName });
}

export function removeDemoUser(uid: string) {
  if (!uid) throw new Error("Не указан пользователь.");
  if (uid === "demo-admin") throw new Error("Нельзя удалить встроенного admin.");
  const users = getDemoUsers();
  const target = users.find((u) => u.uid === uid);
  if (!target) throw new Error("Пользователь не найден.");
  saveDemoUsers(users.filter((u) => u.uid !== uid));
  appendAudit({ action: "delete", uid: target.uid, fullName: target.fullName });
}

export function updateDemoUser(
  uid: string,
  input: { fullName: string; password: string; role?: "isolator" | "director" }
) {
  if (!uid) throw new Error("Не указан пользователь.");
  const fullName = formatFullNameForDisplay(input.fullName);
  if (!fullName) throw new Error("Введите ФамилияИО.");
  if (input.password.length < 2) throw new Error("Пароль должен быть не короче 2 символов.");
  const users = getDemoUsers();
  const idx = users.findIndex((u) => u.uid === uid);
  if (idx < 0) throw new Error("Пользователь не найден.");
  const norm = normalizeFullName(fullName);
  const duplicate = users.find((u) => u.uid !== uid && normalizeFullName(u.fullName) === norm);
  if (duplicate) throw new Error("Пользователь с таким ФамилияИО уже существует.");
  const current = users[idx];
  const updated: DemoUser = {
    ...current,
    fullName,
    password: input.password,
    role: current.uid === "demo-admin" ? "admin" : input.role ?? current.role
  };
  users[idx] = updated;
  saveDemoUsers(users);
  appendAudit({ action: "update", uid: updated.uid, fullName: updated.fullName });
}
