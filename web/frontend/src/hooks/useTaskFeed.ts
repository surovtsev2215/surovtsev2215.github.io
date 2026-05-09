import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { subscribeTasks, type TaskScope } from "../lib/tasksApi";
import { isApiConfigured } from "../lib/runtimeConfig";
import type { Task } from "../types";

export interface TaskFeed {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  openCount: number;
  myOpenCount: number;
  overdueCount: number;
  lastUpdatedAt: number | null;
  refresh: () => void;
}

function isOverdue(task: Task, todayIso: string): boolean {
  if (task.status !== "open") return false;
  if (!task.dueDate) return false;
  return task.dueDate < todayIso;
}

export function useTaskFeed(
  scope: TaskScope,
  currentUid?: string | null,
  options: { autoRefresh?: boolean } = {}
): TaskFeed {
  const autoRefresh = options.autoRefresh ?? true;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!isApiConfigured) {
      setTasks([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const unsubscribe = subscribeTasks(
      scope,
      (next) => {
        setTasks(next);
        setError(null);
        setLoading(false);
        setLastUpdatedAt(Date.now());
      },
      (message) => {
        setError(message);
        toast.error(message);
        setLoading(false);
      },
      undefined,
      autoRefresh
    );
    return () => unsubscribe?.();
  }, [autoRefresh, scope, version]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [tasks.length]);

  const openCount = useMemo(() => tasks.filter((t) => t.status === "open").length, [tasks]);
  const myOpenCount = useMemo(
    () => tasks.filter((t) => t.status === "open" && (!currentUid || t.assigneeUid === currentUid)).length,
    [tasks, currentUid]
  );
  const overdueCount = useMemo(
    () => tasks.filter((t) => isOverdue(t, today)).length,
    [tasks, today]
  );

  return {
    tasks,
    loading,
    error,
    openCount,
    myOpenCount,
    overdueCount,
    lastUpdatedAt,
    refresh: () => setVersion((v) => v + 1)
  };
}
