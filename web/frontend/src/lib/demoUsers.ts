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

const defaultUsers: DemoUser[] = [
  {
    uid: "demo-admin",
    role: "admin",
    fullName: "Начальник ПТО (Demo)",
    email: syntheticEmailForUid("demo-admin"),
    password: "admin123"
  },
  {
    uid: "demo-isolator",
    role: "isolator",
    fullName: "Изолировщик (Demo)",
    email: syntheticEmailForUid("demo-isolator"),
    password: "123456"
  },
  {
    uid: "demo-director",
    role: "director",
    fullName: "Директор (Demo)",
    email: syntheticEmailForUid("demo-director"),
    password: "director123"
  }
];

function migrateRawList(raw: unknown): DemoUser[] {
  if (!Array.isArray(raw)) return defaultUsers;

  const byNorm = new Map<string, DemoUser>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Partial<DemoUser> & { email?: string; fullName?: string; uid?: string };
    let uid = typeof o.uid === "string" && o.uid ? o.uid : "";
    let fullName = typeof o.fullName === "string" ? o.fullName.trim() : "";
    const password = typeof o.password === "string" ? o.password : "";
    const legacyEmail = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
    let role: UserRole =
      o.role === "admin" || o.role === "isolator" || o.role === "director"
        ? o.role
        : legacyEmail === "admin@pto.local"
          ? "admin"
          : legacyEmail === "isolator@pto.local"
            ? "isolator"
            : "isolator";

    if (!fullName && legacyEmail === "admin@pto.local") fullName = defaultUsers[0].fullName;
    if (!fullName && legacyEmail === "isolator@pto.local") fullName = defaultUsers[1].fullName;

    if (!fullName || !password) continue;

    if (!uid) {
      if (legacyEmail) uid = `demo-${legacyEmail.replace(/[^a-z0-9]+/g, "-")}`;
      else uid = `demo-${crypto.randomUUID().slice(0, 8)}`;
    }

    if (uid === "demo-admin") role = "admin";
    else if (uid === "demo-isolator") role = "isolator";
    else if (uid === "demo-director") role = "director";

    const email = syntheticEmailForUid(uid);
    const user: DemoUser = { uid, role, fullName, email, password };
    const norm = normalizeFullName(fullName);
    if (!byNorm.has(norm)) byNorm.set(norm, user);
  }

  for (const d of defaultUsers) {
    const norm = normalizeFullName(d.fullName);
    if (!byNorm.has(norm)) byNorm.set(norm, { ...d, email: syntheticEmailForUid(d.uid) });
  }

  const merged = [...byNorm.values()];
  return merged.length ? merged : defaultUsers;
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
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Укажите ФИО");

  const users = getDemoUsers();
  const norm = normalizeFullName(fullName);
  if (users.some((u) => normalizeFullName(u.fullName) === norm)) {
    throw new Error("Уже есть пользователь с таким ФИО");
  }

  const uid = `demo-${crypto.randomUUID()}`;
  const next: DemoUser = {
    uid,
    role: input.role,
    fullName,
    email: syntheticEmailForUid(uid),
    password: input.password
  };
  saveDemoUsers([...users, next]);
  appendAudit({ action: "create", uid: next.uid, fullName: next.fullName });
  return next;
}

export function removeDemoUser(uid: string) {
  const users = getDemoUsers();
  const target = users.find((u) => u.uid === uid);
  if (!target) return;
  if (target.role === "admin") {
    throw new Error("Администратора demo удалять нельзя");
  }
  saveDemoUsers(users.filter((u) => u.uid !== uid));
  appendAudit({ action: "delete", uid: target.uid, fullName: target.fullName });
}

export function updateDemoUser(
  uid: string,
  input: { fullName: string; password: string; role?: "isolator" | "director" }
) {
  const users = getDemoUsers();
  const target = users.find((u) => u.uid === uid);
  if (!target) throw new Error("Пользователь не найден");

  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Укажите ФИО");
  if (!input.password || input.password.length < 6) {
    throw new Error("Пароль должен быть минимум 6 символов");
  }
  if (target.role === "admin" && input.role) {
    throw new Error("Роль администратора менять нельзя");
  }

  const norm = normalizeFullName(fullName);
  if (users.some((u) => u.uid !== uid && normalizeFullName(u.fullName) === norm)) {
    throw new Error("Уже есть пользователь с таким ФИО");
  }

  const nextRole: UserRole =
    target.role === "admin" ? "admin" : input.role === "director" ? "director" : "isolator";
  const updated = users.map((u) =>
    u.uid === uid ? { ...u, fullName, password: input.password, role: nextRole } : u
  );
  saveDemoUsers(updated);
  appendAudit({ action: "update", uid, fullName });
}
