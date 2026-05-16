import { ApiError, apiRequest } from "./apiClient";
import { getDemoUsers } from "./demoUsers";
import { isApiConfigured, isDemoAllowed } from "./runtimeConfig";
import type { Profile } from "../types";

export type CrewIsolatorPick = Pick<Profile, "uid" | "fullName" | "position" | "brigadeNumber">;

const CREW_404_HINT =
  "Список участников недоступен: на сервере старая версия API. Администратору нужен Manual Deploy сервиса pto-backend на Render (последний commit из репозитория).";

export function formatCrewApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return CREW_404_HINT;
    return error.message;
  }
  return error instanceof Error ? error.message : "Не удалось загрузить список изолировщиков";
}

export async function fetchCrewIsolators(): Promise<CrewIsolatorPick[]> {
  if (!isApiConfigured && isDemoAllowed) {
    return getDemoUsers()
      .filter((u) => u.role === "isolator")
      .map((u) => ({
        uid: u.uid,
        fullName: u.fullName,
        position: "",
        brigadeNumber: ""
      }));
  }
  try {
    const { users } = await apiRequest<{ users: CrewIsolatorPick[] }>("/api/crew/isolators");
    return users;
  } catch (error) {
    throw new Error(formatCrewApiError(error));
  }
}
