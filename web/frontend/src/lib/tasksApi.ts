import { apiRequest } from "./apiClient";
import { isApiConfigured } from "./runtimeConfig";
import type { Task, TaskStatus } from "../types";

export type TaskScope = "assignedToMe" | "createdByMe" | "all";
const TASK_POLL_INTERVAL_MS = 12000;
const TASK_CACHE_TTL_MS = 5000;
const tasksCache = new Map<string, { at: number; rows: Task[] }>();

export interface CreateTaskInput {
  title: string;
  description?: string;
  assigneeUid: string;
  dueDate?: string;
  relatedReportId?: string;
  relatedReportLabel?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assigneeUid?: string;
  dueDate?: string | null;
  relatedReportId?: string | null;
  relatedReportLabel?: string | null;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value.length) usp.set(key, value);
  }
  const query = usp.toString();
  return query ? `?${query}` : "";
}

function cacheKey(scope: TaskScope, status?: TaskStatus): string {
  return `${scope}|${status || ""}`;
}

function getFreshCachedTasks(scope: TaskScope, status?: TaskStatus): Task[] | null {
  const key = cacheKey(scope, status);
  const row = tasksCache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > TASK_CACHE_TTL_MS) return null;
  return row.rows;
}

export async function fetchTasks(scope: TaskScope = "all", status?: TaskStatus): Promise<Task[]> {
  if (!isApiConfigured) return [];
  try {
    const { tasks } = await apiRequest<{ tasks: Task[] }>(
      `/api/tasks${buildQuery({ scope, status })}`
    );
    tasksCache.set(cacheKey(scope, status), { at: Date.now(), rows: tasks });
    return tasks;
  } catch {
    return [];
  }
}

export async function createTask(input: CreateTaskInput): Promise<Task | null> {
  if (!isApiConfigured) return null;
  const { task } = await apiRequest<{ task: Task }>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return task;
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task | null> {
  if (!isApiConfigured) return null;
  const { task } = await apiRequest<{ task: Task }>(`/api/tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  if (!isApiConfigured) return;
  await apiRequest(`/api/tasks/${id}`, { method: "DELETE" });
}

export function subscribeTasks(
  scope: TaskScope,
  callback: (tasks: Task[]) => void,
  onError?: (message: string) => void,
  status?: TaskStatus,
  autoRefresh = true
) {
  if (!isApiConfigured) {
    callback([]);
    return () => {};
  }
  let disposed = false;
  let inFlight = false;
  const cached = getFreshCachedTasks(scope, status);
  if (cached) callback(cached);
  const emit = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const tasks = await fetchTasks(scope, status);
      if (!disposed) callback(tasks);
    } catch {
      if (!disposed) onError?.("Не удалось загрузить задачи. Проверьте сеть.");
    } finally {
      inFlight = false;
    }
  };
  void emit();
  const timer = autoRefresh
    ? window.setInterval(() => {
        if (document.hidden) return;
        void emit();
      }, TASK_POLL_INTERVAL_MS)
    : null;
  return () => {
    disposed = true;
    if (timer !== null) window.clearInterval(timer);
  };
}
