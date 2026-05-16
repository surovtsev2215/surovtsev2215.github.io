const env = import.meta.env;

export const apiBaseUrl = String(env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
export const isApiConfigured = apiBaseUrl.length > 0;
export const isDemoAllowed = import.meta.env.DEV && !isApiConfigured;

export function buildApiUrl(pathname: string): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${apiBaseUrl}${normalized}`;
}
