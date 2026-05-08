import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAllUsers } from "../lib/usersApi";
import { isApiConfigured } from "../lib/runtimeConfig";
import type { Profile } from "../types";

const REFRESH_INTERVAL_MS = 60_000;

let cachedUsers: Profile[] | null = null;
let cachedAt = 0;
let inflight: Promise<Profile[]> | null = null;

async function loadUsers(force = false): Promise<Profile[]> {
  if (!isApiConfigured) return [];
  const now = Date.now();
  if (!force && cachedUsers && now - cachedAt < REFRESH_INTERVAL_MS) {
    return cachedUsers;
  }
  if (inflight) return inflight;
  inflight = fetchAllUsers()
    .then((users) => {
      cachedUsers = users;
      cachedAt = Date.now();
      return users;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export interface UsersDirectory {
  users: Profile[];
  loading: boolean;
  byUid: (uid: string | undefined | null) => Profile | undefined;
  byPosition: (position: string) => Profile[];
  refresh: () => Promise<void>;
}

export function useUsersDirectory(options: { autoRefresh?: boolean } = {}): UsersDirectory {
  const autoRefresh = options.autoRefresh ?? true;
  const [users, setUsers] = useState<Profile[]>(cachedUsers ?? []);
  const [loading, setLoading] = useState(!cachedUsers);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAndSet = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const next = await loadUsers(force);
      if (mountedRef.current) setUsers(next);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAndSet(false);
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void fetchAndSet(true);
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchAndSet]);

  const byUid = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const user of users) map.set(user.uid, user);
    return (uid: string | undefined | null) => (uid ? map.get(uid) : undefined);
  }, [users]);

  const byPosition = useMemo(() => {
    const map = new Map<string, Profile[]>();
    for (const user of users) {
      const key = (user.position || "").trim();
      const list = map.get(key) || [];
      list.push(user);
      map.set(key, list);
    }
    return (position: string) => map.get(position) || [];
  }, [users]);

  const refresh = useCallback(async () => {
    await fetchAndSet(true);
  }, [fetchAndSet]);

  return { users, loading, byUid, byPosition, refresh };
}
