import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { useTaskFeed } from "../hooks/useTaskFeed";
import { isApiConfigured } from "../lib/runtimeConfig";
import { deleteTask, updateTask, type TaskScope } from "../lib/tasksApi";
import { buildItrAccess } from "../lib/itrAccess";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { FilterPanel } from "../components/layout/FilterPanel";
import { TaskDialog } from "../components/itr/TaskDialog";
import { formatFullNameForDisplay } from "../lib/normalizeFullName";
import type { Task, TaskStatus } from "../types";
import { cn } from "../lib/utils";

type TaskUiFilter = TaskStatus | "overdue";

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Открыта",
  done: "Выполнена",
  cancelled: "Отменена"
};

function StatusBadge({ status, overdue }: { status: TaskStatus; overdue?: boolean }) {
  const tone = overdue && status === "open"
    ? "border-rose-200 bg-rose-50 text-rose-700 theme-dark:border-rose-800 theme-dark:bg-rose-950/40 theme-dark:text-rose-300"
    : status === "done"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 theme-dark:border-emerald-800 theme-dark:bg-emerald-950/40 theme-dark:text-emerald-300"
      : status === "cancelled"
        ? "border-slate-200 bg-slate-100 text-slate-600 theme-dark:border-slate-700 theme-dark:bg-slate-800/60 theme-dark:text-slate-300"
        : "border-amber-200 bg-amber-50 text-amber-700 theme-dark:border-amber-800 theme-dark:bg-amber-950/40 theme-dark:text-amber-300";
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", tone)}>
      {overdue && status === "open" ? "Просрочена" : STATUS_LABELS[status]}
    </span>
  );
}

export function DirectorTasksPage() {
  const { profile } = useAuth();
  const access = buildItrAccess(profile?.position, profile?.allowedSections);
  const [scope, setScope] = useState<TaskScope>("assignedToMe");
  const tasks = useTaskFeed(scope, profile?.uid);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<TaskUiFilter[]>([]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [tasks.tasks.length]);

  const sorted = useMemo(() => {
    return tasks.tasks.slice().sort((a, b) => {
      const order = (s: TaskStatus) => (s === "open" ? 0 : s === "done" ? 2 : 1);
      const so = order(a.status) - order(b.status);
      if (so !== 0) return so;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }, [tasks.tasks]);

  const taskStats = useMemo(() => {
    const open = tasks.tasks.filter((t) => t.status === "open").length;
    const done = tasks.tasks.filter((t) => t.status === "done").length;
    const cancelled = tasks.tasks.filter((t) => t.status === "cancelled").length;
    const overdue = tasks.tasks.filter((t) => t.status === "open" && !!t.dueDate && t.dueDate < today).length;
    return { open, done, cancelled, overdue };
  }, [tasks.tasks, today]);

  const visibleTasks = useMemo(() => {
    if (statusFilters.length === 0) return sorted;
    return sorted.filter((t) => {
      return statusFilters.some((filter) => {
        if (filter === "overdue") return t.status === "open" && !!t.dueDate && t.dueDate < today;
        return t.status === filter;
      });
    });
  }, [sorted, statusFilters, today]);

  async function changeStatus(task: Task, status: TaskStatus) {
    try {
      await updateTask(task.id, { status });
      tasks.refresh();
      toast.success(status === "done" ? "Задача завершена" : status === "cancelled" ? "Задача отменена" : "Открыта снова");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось обновить задачу");
    }
  }

  async function removeTask(task: Task) {
    if (!confirm(`Удалить задачу «${task.title}»?`)) return;
    try {
      await deleteTask(task.id);
      tasks.refresh();
      toast.success("Задача удалена");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить задачу");
    }
  }

  function resetTaskFilters() {
    setStatusFilters([]);
    setScope("assignedToMe");
  }

  function toggleStatusFilter(filter: TaskUiFilter) {
    setStatusFilters((current) => (current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]));
  }

  if (!isApiConfigured) {
    return (
      <div className="page-stack">
        <div className="surface-highlight surface-hero-light animate-in-up p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Задачи</h2>
              <p className="mt-1 text-sm text-slate-100/90">Доступно только в локальной версии.</p>
            </div>
            <ClipboardList className="h-5 w-5 shrink-0 text-amber-300" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="surface-highlight surface-hero-light animate-in-up p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Задачи</h2>
            <p className="mt-1 text-sm text-slate-100/90">
              Постановка задач коллегам и контроль исполнения.
            </p>
          </div>
          <ClipboardList className="h-5 w-5 shrink-0 text-amber-300" />
        </div>
      </div>

      {!tasks.loading && visibleTasks.length === 0 ? (
        <Card className="soft-ring surface-floating">
          <CardContent className="flex justify-center p-6 sm:p-7">
            <Button type="button" size="lg" className="min-w-[220px]" onClick={() => setDialogOpen(true)}>
              Поставить задачу
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <FilterPanel>
        <div className="filter-btn-row">
          <Button
            type="button"
            size="sm"
            variant={scope === "assignedToMe" ? "default" : "secondary"}
            onClick={() => setScope("assignedToMe")}
          >
            Назначенные мне
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === "createdByMe" ? "default" : "secondary"}
            onClick={() => setScope("createdByMe")}
          >
            Созданные мной
          </Button>
          {access.isManagement && (
            <Button
              type="button"
              size="sm"
              variant={scope === "all" ? "default" : "secondary"}
              onClick={() => setScope("all")}
            >
              Все
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={resetTaskFilters}>
            Сброс
          </Button>
        </div>
        <div className="filter-btn-row">
          <Button type="button" size="sm" variant={statusFilters.length === 0 ? "default" : "secondary"} onClick={() => setStatusFilters([])}>
            Все ({tasks.tasks.length})
          </Button>
          <Button type="button" size="sm" variant={statusFilters.includes("open") ? "default" : "secondary"} onClick={() => toggleStatusFilter("open")}>
            Открытые ({taskStats.open})
          </Button>
          <Button type="button" size="sm" variant={statusFilters.includes("overdue") ? "default" : "secondary"} onClick={() => toggleStatusFilter("overdue")}>
            Просроченные ({taskStats.overdue})
          </Button>
          <Button type="button" size="sm" variant={statusFilters.includes("done") ? "default" : "secondary"} onClick={() => toggleStatusFilter("done")}>
            Выполненные ({taskStats.done})
          </Button>
          <Button type="button" size="sm" variant={statusFilters.includes("cancelled") ? "default" : "secondary"} onClick={() => toggleStatusFilter("cancelled")}>
            Отменённые ({taskStats.cancelled})
          </Button>
        </div>
      </FilterPanel>

      {tasks.loading && tasks.tasks.length === 0 ? (
        <Card className="soft-ring surface-floating">
          <CardContent className="p-4 text-sm text-slate-500 theme-dark:text-slate-400">Загрузка…</CardContent>
        </Card>
      ) : visibleTasks.length === 0 ? null
      : (
        <div className="space-y-2">
          {visibleTasks.map((task) => {
            const overdue = task.status === "open" && !!task.dueDate && task.dueDate < today;
            const isAuthor = task.createdByUid === profile?.uid;
            return (
              <Card
                key={task.id}
                className={cn(
                  "soft-ring surface-floating itr-panel",
                  overdue ? "ring-1 ring-rose-300 theme-dark:ring-rose-700" : ""
                )}
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{task.title}</div>
                      {task.description ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 theme-dark:text-slate-300">
                          {task.description}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge status={task.status} overdue={overdue} />
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 theme-dark:text-slate-400">
                    <span>
                      Исполнитель: {formatFullNameForDisplay(task.assigneeFullName || "")}
                      {task.assigneePosition ? ` · ${task.assigneePosition}` : ""}
                    </span>
                    <span>
                      Автор: {formatFullNameForDisplay(task.createdByFullName || "")}
                    </span>
                    {task.dueDate ? <span>До {task.dueDate}</span> : <span>Без срока</span>}
                    {task.relatedReportId ? (
                      <Link to={`/report/${task.relatedReportId}`} className="text-primary hover:underline theme-dark:text-accent">
                        Связанный отчёт
                      </Link>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {task.status === "open" && (
                      <>
                        <Button type="button" size="sm" onClick={() => void changeStatus(task, "done")}>
                          Выполнено
                        </Button>
                        {(isAuthor || access.isManagement) && (
                          <Button type="button" size="sm" variant="secondary" onClick={() => void changeStatus(task, "cancelled")}>
                            Отменить
                          </Button>
                        )}
                      </>
                    )}
                    {task.status !== "open" && isAuthor && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => void changeStatus(task, "open")}>
                        Открыть снова
                      </Button>
                    )}
                    {(isAuthor || access.isManagement) && (
                      <Button type="button" size="sm" variant="outline" onClick={() => void removeTask(task)}>
                        <Trash2 className="h-4 w-4" aria-hidden /> Удалить
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => tasks.refresh()}
      />
    </div>
  );
}
