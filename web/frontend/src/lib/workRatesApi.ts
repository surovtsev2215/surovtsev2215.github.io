import { apiRequest } from "./apiClient";
import { DEFAULT_WORK_RATES, normalizeWorkRates, type WorkRates } from "./workRates";
import { isApiConfigured, isDemoAllowed } from "./runtimeConfig";

const DEMO_KEY = "pto-work-rates";

function loadDemoRates(): WorkRates {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) return { ...DEFAULT_WORK_RATES };
    return normalizeWorkRates(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WORK_RATES };
  }
}

function saveDemoRates(rates: WorkRates) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(rates));
}

export async function fetchWorkRates(): Promise<WorkRates> {
  if (isApiConfigured) {
    const { rates } = await apiRequest<{ rates: WorkRates }>("/api/settings/work-rates");
    return normalizeWorkRates(rates);
  }
  if (isDemoAllowed) return loadDemoRates();
  return { ...DEFAULT_WORK_RATES };
}

export async function saveWorkRates(rates: WorkRates): Promise<WorkRates> {
  const payload = normalizeWorkRates(rates);
  if (isApiConfigured) {
    const { rates: saved } = await apiRequest<{ rates: WorkRates }>("/api/settings/work-rates", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    return normalizeWorkRates(saved);
  }
  if (isDemoAllowed) {
    const withMeta = { ...payload, updatedAt: new Date().toISOString() };
    saveDemoRates(withMeta);
    return withMeta;
  }
  throw new Error("Сохранение расценок доступно только при подключённом сервере.");
}
