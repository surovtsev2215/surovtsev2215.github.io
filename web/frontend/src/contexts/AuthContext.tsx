import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithCustomToken,
  signOut
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, functions } from "../lib/firebase";
import type { Profile, UserRole } from "../types";
import { isFirebaseConfigured } from "../lib/firebase";
import { getDemoUsers } from "../lib/demoUsers";
import { normalizeFullName } from "../lib/normalizeFullName";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  login: (fullName: string, password: string) => Promise<void>;
  register: (fullName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const loginByFullNameFn = httpsCallable<{ fullName: string; password: string }, { token: string }>(
  functions,
  "loginByFullName"
);
const registerByFullNameFn = httpsCallable<{ fullName: string; password: string }, { token: string }>(
  functions,
  "registerByFullName"
);

function userMessageFromLoginError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("not-found")) return "Пользователь с таким ФИО не найден.";
  if (code.includes("permission-denied")) return "Неверный пароль.";
  if (code.includes("resource-exhausted")) return "Слишком много попыток. Повторите позже.";
  if (code.includes("unavailable")) return "Сервис входа временно недоступен. Проверьте интернет.";
  if (code.includes("deadline-exceeded")) return "Превышено время ожидания входа. Попробуйте снова.";
  if (error instanceof Error && error.message) return error.message;
  return "Не удалось выполнить вход.";
}

function userMessageFromRegisterError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("already-exists")) return "Пользователь с таким ФИО уже существует.";
  if (code.includes("invalid-argument")) return "Проверьте ФИО и пароль (минимум 6 символов).";
  if (code.includes("resource-exhausted")) return "Слишком много попыток регистрации. Повторите позже.";
  if (code.includes("unavailable")) return "Сервис регистрации временно недоступен. Проверьте интернет.";
  if (code.includes("deadline-exceeded")) return "Превышено время ожидания регистрации. Попробуйте снова.";
  if (error instanceof Error && error.message) return error.message;
  return "Не удалось зарегистрироваться.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      const saved = localStorage.getItem("pto-demo-user");
      try {
        if (saved) {
          const parsed = JSON.parse(saved) as {
            role: UserRole;
            fullName: string;
            email: string;
            uid?: string;
          };
          setRole(parsed.role);
          const fallbackUid =
            parsed.role === "admin"
              ? "demo-admin"
              : parsed.role === "director"
                ? "demo-director"
                : "demo-isolator";
          setProfile({
            uid: parsed.uid ?? fallbackUid,
            email: parsed.email,
            fullName: parsed.fullName,
            role: parsed.role
          });
        }
      } catch {
        localStorage.removeItem("pto-demo-user");
        setProfile(null);
        setRole(null);
      }
      setLoading(false);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setUser(firebaseUser);
        if (!firebaseUser) {
          setProfile(null);
          setRole(null);
          return;
        }

        const tokenResult = await firebaseUser.getIdTokenResult(true);
        const claimRole = tokenResult.claims.role as UserRole | undefined;

        const profileDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        const profileData = profileDoc.exists() ? (profileDoc.data() as Profile) : null;
        const resolvedRole = claimRole ?? profileData?.role ?? null;

        // Fail closed: no role means no protected access until profile/claims are fixed.
        if (!resolvedRole) {
          setRole(null);
          setProfile(null);
          return;
        }

        setRole(resolvedRole);
        setProfile(
          profileData ?? {
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? "",
            fullName: firebaseUser.displayName ?? "",
            role: resolvedRole
          }
        );
      } catch {
        setProfile(null);
        setRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role,
      loading,
      login: async (fullName, password) => {
        if (!isFirebaseConfigured) {
          const norm = normalizeFullName(fullName);
          if (!norm) throw new Error("Введите ФИО.");
          const matched = getDemoUsers().find(
            (u) => normalizeFullName(u.fullName) === norm && u.password === password
          );
          if (matched) {
            const saved = {
              role: matched.role as UserRole,
              fullName: matched.fullName,
              email: matched.email,
              uid: matched.uid
            };
            localStorage.setItem("pto-demo-user", JSON.stringify(saved));
            setRole(saved.role);
            setProfile({
              uid: saved.uid,
              email: saved.email,
              fullName: saved.fullName,
              role: saved.role
            });
            return;
          }
          throw new Error("Проверьте ФИО и пароль.");
        }

        try {
          const { data } = await loginByFullNameFn({ fullName: fullName.trim(), password });
          if (!data?.token) throw new Error("Сервер не вернул токен входа.");
          await signInWithCustomToken(auth, data.token);
        } catch (error) {
          throw new Error(userMessageFromLoginError(error));
        }
      },
      register: async (fullName, password) => {
        if (!isFirebaseConfigured) {
          throw new Error("Регистрация недоступна в demo-режиме. Создайте пользователя в панели администратора.");
        }
        try {
          const { data } = await registerByFullNameFn({ fullName: fullName.trim(), password });
          if (!data?.token) throw new Error("Сервер не вернул токен регистрации.");
          await signInWithCustomToken(auth, data.token);
        } catch (error) {
          throw new Error(userMessageFromRegisterError(error));
        }
      },
      logout: async () => {
        if (!isFirebaseConfigured) {
          localStorage.removeItem("pto-demo-user");
          setRole(null);
          setProfile(null);
          return;
        }
        await signOut(auth);
      }
    }),
    [loading, profile, role, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
