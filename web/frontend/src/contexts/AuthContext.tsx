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
import { formatFullNameForDisplay } from "../lib/normalizeFullName";

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
  if (code.includes("not-found")) return "Пользователь с таким ФамилияИО не найден.";
  if (code.includes("permission-denied")) return "Неверный пароль.";
  if (code.includes("resource-exhausted")) return "Слишком много попыток. Повторите позже.";
  if (code.includes("unavailable")) return "Сервис входа временно недоступен. Проверьте интернет.";
  if (code.includes("deadline-exceeded")) return "Превышено время ожидания входа. Попробуйте снова.";
  if (error instanceof Error && error.message) return error.message;
  return "Не удалось выполнить вход.";
}

function userMessageFromRegisterError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("already-exists")) return "Пользователь с таким ФамилияИО уже существует.";
  if (code.includes("invalid-argument"))
    return "Проверьте имя и пароль. Для обычной регистрации требуется ФамилияИО с отчеством.";
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
    // #region agent log
    fetch("http://127.0.0.1:7653/ingest/20d63d97-1111-4b46-9651-c2ddf66cae7c", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cddc9f" },
      body: JSON.stringify({
        sessionId: "cddc9f",
        runId: "pre-fix",
        hypothesisId: "H3",
        location: "src/contexts/AuthContext.tsx:useEffect",
        message: "auth state subscription started",
        data: {},
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        // #region agent log
        fetch("http://127.0.0.1:7653/ingest/20d63d97-1111-4b46-9651-c2ddf66cae7c", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cddc9f" },
          body: JSON.stringify({
            sessionId: "cddc9f",
            runId: "pre-fix",
            hypothesisId: "H3",
            location: "src/contexts/AuthContext.tsx:onAuthStateChanged",
            message: "auth callback fired",
            data: { hasFirebaseUser: Boolean(firebaseUser), uid: firebaseUser?.uid ?? null },
            timestamp: Date.now()
          })
        }).catch(() => {});
        // #endregion
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

        // #region agent log
        fetch("http://127.0.0.1:7653/ingest/20d63d97-1111-4b46-9651-c2ddf66cae7c", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cddc9f" },
          body: JSON.stringify({
            sessionId: "cddc9f",
            runId: "pre-fix",
            hypothesisId: "H4",
            location: "src/contexts/AuthContext.tsx:roleResolution",
            message: "resolved role from claims/profile",
            data: {
              claimRole: claimRole ?? null,
              profileRole: profileData?.role ?? null,
              resolvedRole: resolvedRole ?? null,
              profileExists: profileDoc.exists()
            },
            timestamp: Date.now()
          })
        }).catch(() => {});
        // #endregion

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
      } catch (error) {
        // #region agent log
        fetch("http://127.0.0.1:7653/ingest/20d63d97-1111-4b46-9651-c2ddf66cae7c", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cddc9f" },
          body: JSON.stringify({
            sessionId: "cddc9f",
            runId: "pre-fix",
            hypothesisId: "H5",
            location: "src/contexts/AuthContext.tsx:onAuthStateChangedCatch",
            message: "auth flow failed in callback",
            data: { error: error instanceof Error ? error.message : "unknown" },
            timestamp: Date.now()
          })
        }).catch(() => {});
        // #endregion
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
        try {
          const { data } = await loginByFullNameFn({ fullName: formatFullNameForDisplay(fullName), password });
          if (!data?.token) throw new Error("Сервер не вернул токен входа.");
          await signInWithCustomToken(auth, data.token);
        } catch (error) {
          throw new Error(userMessageFromLoginError(error));
        }
      },
      register: async (fullName, password) => {
        const normalizedDisplayName = formatFullNameForDisplay(fullName);
        try {
          const { data } = await registerByFullNameFn({ fullName: normalizedDisplayName, password });
          if (!data?.token) throw new Error("Сервер не вернул токен регистрации.");
          await signInWithCustomToken(auth, data.token);
        } catch (error) {
          throw new Error(userMessageFromRegisterError(error));
        }
      },
      logout: async () => {
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
