import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest, setApiAuthFailureHandler, setApiToken } from "../lib/apiClient";
import { authenticateDemoUser, demoUserToProfile } from "../lib/demoUsers";
import { isApiConfigured, isDemoAllowed } from "../lib/runtimeConfig";
import type { Profile, UserRole } from "../types";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";

export type SessionUser = { uid: string } | null;

interface AuthContextValue {
  user: SessionUser;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  login: (fullName: string, password: string) => Promise<void>;
  register: (fullName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const API_PROFILE_KEY = "pto-api-profile";
const DEMO_PROFILE_KEY = "pto-demo-profile";

function userMessageFromLoginError(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return "Неверное имя или пароль.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Не удалось выполнить вход.";
}

function userMessageFromRegisterError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Не удалось зарегистрироваться.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser>(null);
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
            setUser({ uid: cached.uid });
          }
          const { profile: fresh } = await apiRequest<{ profile: Profile }>("/api/auth/me");
          localStorage.setItem(API_PROFILE_KEY, JSON.stringify(fresh));
          setProfile(fresh);
          setRole(fresh.role);
          setUser({ uid: fresh.uid });
        } catch (error) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            setApiToken("");
            localStorage.removeItem(API_PROFILE_KEY);
            setProfile(null);
            setRole(null);
            setUser(null);
          }
        } finally {
          setLoading(false);
        }
      };
      void bootstrapFromApiSession();
      return () => setApiAuthFailureHandler(null);
    }

    if (!isDemoAllowed) {
      setLoading(false);
      return;
    }

    try {
      const raw = localStorage.getItem(DEMO_PROFILE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Profile;
        setProfile(cached);
        setRole(cached.role);
        setUser({ uid: cached.uid });
      }
    } catch {
      localStorage.removeItem(DEMO_PROFILE_KEY);
    } finally {
      setLoading(false);
    }
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
            setUser({ uid: nextProfile.uid });
          } catch (error) {
            throw new Error(userMessageFromLoginError(error));
          }
          return;
        }
        if (!isDemoAllowed) {
          throw new Error("Сайт не подключён к серверу. Обратитесь к администратору.");
        }
        const demoUser = authenticateDemoUser(fullName, password);
        if (!demoUser) {
          throw new Error("Неверное имя или пароль.");
        }
        const nextProfile = demoUserToProfile(demoUser);
        localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(nextProfile));
        setProfile(nextProfile);
        setRole(nextProfile.role);
        setUser({ uid: nextProfile.uid });
      },
      register: async (fullName, password) => {
        if (!isApiConfigured) {
          throw new Error("Регистрация доступна только при подключённом backend API.");
        }
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
          setUser({ uid: nextProfile.uid });
        } catch (error) {
          throw new Error(userMessageFromRegisterError(error));
        }
      },
      logout: async () => {
        if (isApiConfigured) {
          setApiToken("");
          localStorage.removeItem(API_PROFILE_KEY);
        } else {
          localStorage.removeItem(DEMO_PROFILE_KEY);
        }
        setProfile(null);
        setRole(null);
        setUser(null);
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
