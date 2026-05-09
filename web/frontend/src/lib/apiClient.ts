import { buildApiUrl, isApiConfigured } from "./runtimeConfig";

const TOKEN_KEY = "pto-api-token";
const REQUEST_TIMEOUT_MS = 12000;
const inFlightGetRequests = new Map<string, Promise<unknown>>();

type AuthFailureHandler = () => void;
let authFailureHandler: AuthFailureHandler | null = null;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getApiToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setApiToken(token: string) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export function setApiAuthFailureHandler(handler: AuthFailureHandler | null) {
  authFailureHandler = handler;
}

function normalizeErrorMessage(data: unknown, rawText: string, status: number): string {
  const jsonMessage = typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : "";
  const plainMessage = rawText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return jsonMessage || plainMessage || `Ошибка API (${status}).`;
}

function mergeSignals(controller: AbortController, signal?: AbortSignal | null): () => void {
  if (!signal) return () => {};
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) controller.abort(signal.reason);
  return () => signal.removeEventListener("abort", onAbort);
}

export async function apiRequest<T>(pathname: string, init?: RequestInit): Promise<T> {
  if (!isApiConfigured) {
    throw new Error("API режим не настроен. Укажите VITE_API_BASE_URL.");
  }

  const token = getApiToken();
  const method = (init?.method || "GET").toUpperCase();
  const requestKey = `${method}|${buildApiUrl(pathname)}|${token}`;
  if (method === "GET" && !init?.body) {
    const existing = inFlightGetRequests.get(requestKey);
    if (existing) return existing as Promise<T>;
  }

  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const doRequest = async () => {
    const controller = new AbortController();
    const cleanupSignal = mergeSignals(controller, init?.signal);
    const timeoutId = window.setTimeout(() => controller.abort(new Error("timeout")), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(buildApiUrl(pathname), { ...init, headers, signal: controller.signal });
      if (response.status === 204) return undefined as T;

      let data: unknown = null;
      let rawText = "";
      try {
        data = await response.json();
      } catch {
        data = null;
        try {
          rawText = await response.text();
        } catch {
          rawText = "";
        }
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          authFailureHandler?.();
        }
        throw new ApiError(normalizeErrorMessage(data, rawText, response.status), response.status);
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Превышено время ожидания ответа сервера.");
      }
      if (error instanceof TypeError) {
        throw new Error("Сеть недоступна или сервер не отвечает.");
      }
      throw error;
    } finally {
      cleanupSignal();
      window.clearTimeout(timeoutId);
    }
  };

  const requestPromise = doRequest();
  if (method === "GET" && !init?.body) {
    inFlightGetRequests.set(requestKey, requestPromise as Promise<unknown>);
    try {
      return await requestPromise;
    } catch {
      throw new Error("Ошибка сети при запросе к API.");
    } finally {
      inFlightGetRequests.delete(requestKey);
    }
  }

  return requestPromise;
}
