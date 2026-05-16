import { apiRequest } from "./apiClient";
import { getDemoUsers } from "./demoUsers";
import { isApiConfigured, isDemoAllowed } from "./runtimeConfig";
import type { Profile } from "../types";

export type CrewIsolatorPick = Pick<Profile, "uid" | "fullName" | "position" | "brigadeNumber">;

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
  const { users } = await apiRequest<{ users: CrewIsolatorPick[] }>("/api/crew/isolators");
  return users;
}
