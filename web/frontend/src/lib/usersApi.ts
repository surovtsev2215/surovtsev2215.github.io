import { apiRequest } from "./apiClient";
import { isApiConfigured } from "./runtimeConfig";
import type { Profile } from "../types";

export async function fetchAllUsers(): Promise<Profile[]> {
  if (!isApiConfigured) return [];
  try {
    const { users } = await apiRequest<{ users: Profile[] }>("/api/users");
    return users;
  } catch {
    return [];
  }
}
