import type { UserRole } from "../types";
import { normalizeFullName } from "./normalizeFullName";
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
  const adminFromStorage = raw.find((item) => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<DemoUser>;
    return (
      (candidate.uid === "demo-admin" || normalizeFullName(candidate.fullName ?? "") === "admin") &&
      candidate.role === "admin"
    );
  }) as Partial<DemoUser> | undefined;

  if (!adminFromStorage) return defaultUsers;
  return [
    {
      uid: "demo-admin",
      role: "admin",
      fullName: "admin",
      email: syntheticEmailForUid("demo-admin"),
      password: "3001"
    }
  ];
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
  void input;
  throw new Error("Создание профилей временно отключено. Доступен только admin.");
}

export function removeDemoUser(uid: string) {
  void uid;
  throw new Error("Удаление профилей отключено. Доступен только admin.");
}

export function updateDemoUser(
  uid: string,
  input: { fullName: string; password: string; role?: "isolator" | "director" }
) {
  void uid;
  void input;
  throw new Error("Изменение профилей отключено. Доступен только admin.");
}
