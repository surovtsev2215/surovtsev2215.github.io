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
import { ApiError, apiRequest, setApiAuthFailureHandler, setApiToken } from "../lib/apiClient";
import { isApiConfigured } from "../lib/runtimeConfig";
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
const API_PROFILE_KEY = "pto-api-profile";

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
  if (code.includes("invalid-argument")) return "Проверьте имя и пароль. Пароль должен быть минимум 2 символа.";
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
    if (isApiConfigured) {
      setApiAuthFailureHandler(() => {
        setApiToken("");
        localStorage.removeItem(API_PROFILE_KEY);
        setProfile(null);
        setRole(null);
        setUser(null);
      });
      const bootstrapFromApiSession = async () => {
        try {
          const raw = localStorage.getItem(API_PROFILE_KEY);
          if (raw) {
            const cached = JSON.parse(raw) as Profile;
            setProfile(cached);
            setRole(cached.role);
          }
          const { profile: fresh } = await apiRequest<{ profile: Profile }>("/api/auth/me");
          localStorage.setItem(API_PROFILE_KEY, JSON.stringify(fresh));
          setProfile(fresh);
          setRole(fresh.role);
          setUser({ uid: fresh.uid } as User);
        } catch {
          setApiToken("");
          localStorage.removeItem(API_PROFILE_KEY);
          setProfile(null);
          setRole(null);
          setUser(null);
        } finally {
          setLoading(false);
        }
      };
      void bootstrapFromApiSession();
      return () => setApiAuthFailureHandler(null);
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
      } catch (error) {
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
        if (isApiConfigured) {
          try {
            const normalizedDisplayName = formatFullNameForDisplay(fullName);
            const { token, profile: nextProfile } = await apiRequest<{ token: string; profile: Profile }>(
              "/api/auth/login",
              {
                method: "POST",
                body: JSON.stringify({ fullName: normalizedDisplayName, password })
              }
            );
            setApiToken(token);
            localStorage.setItem(API_PROFILE_KEY, JSON.stringify(nextProfile));
            setProfile(nextProfile);
            setRole(nextProfile.role);
            setUser({ uid: nextProfile.uid } as User);
          } catch (error) {
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
              throw new Error("Неверное имя или пароль.");
            }
            throw new Error(userMessageFromLoginError(error));
          }
          return;
        }
        try {
          const { data } = await loginByFullNameFn({ fullName: formatFullNameForDisplay(fullName), password });
          if (!data?.token) throw new Error("Сервер не вернул токен входа.");
          await signInWithCustomToken(auth, data.token);
        } catch (error) {
          throw new Error(userMessageFromLoginError(error));
        }
      },
      register: async (fullName, password) => {
        if (isApiConfigured) {
          try {
            const normalizedDisplayName = formatFullNameForDisplay(fullName);
            const { token, profile: nextProfile } = await apiRequest<{ token: string; profile: Profile }>(
              "/api/auth/register",
              {
                method: "POST",
                body: JSON.stringify({ fullName: normalizedDisplayName, password })
              }
            );
            setApiToken(token);
            localStorage.setItem(API_PROFILE_KEY, JSON.stringify(nextProfile));
            setProfile(nextProfile);
            setRole(nextProfile.role);
            setUser({ uid: nextProfile.uid } as User);
          } catch (error) {
            throw new Error(userMessageFromRegisterError(error));
          }
          return;
        }
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
        if (isApiConfigured) {
          setApiToken("");
          localStorage.removeItem(API_PROFILE_KEY);
          setProfile(null);
          setRole(null);
          setUser(null);
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
