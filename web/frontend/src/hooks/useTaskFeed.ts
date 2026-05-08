import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { subscribeTasks, type TaskScope } from "../lib/tasksApi";
import { isApiConfigured } from "../lib/runtimeConfig";
import type { Task } from "../types";

export interface TaskFeed {
  tasks: Task[];
  loading: boolean;
  openCount: number;
  myOpenCount: number;
  overdueCount: number;
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
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!isApiConfigured) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeTasks(
      scope,
      (next) => {
        setTasks(next);
        setLoading(false);
      },
      (message) => {
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
    openCount,
    myOpenCount,
    overdueCount,
    refresh: () => setVersion((v) => v + 1)
  };
}
