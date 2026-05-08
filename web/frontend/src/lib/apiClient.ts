import { buildApiUrl, isApiConfigured } from "./runtimeConfig";

const TOKEN_KEY = "pto-api-token";

export function getApiToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setApiToken(token: string) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export async function apiRequest<T>(pathname: string, init?: RequestInit): Promise<T> {
  if (!isApiConfigured) {
    throw new Error("API режим не настроен. Укажите VITE_API_BASE_URL.");
  }

  const token = getApiToken();
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(buildApiUrl(pathname), { ...init, headers });
  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : "Ошибка API.";
    throw new Error(message);
  }

  return data as T;
}
