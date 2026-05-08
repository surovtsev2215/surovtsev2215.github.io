import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useUsersDirectory } from "../../hooks/useUsersDirectory";
import { createTask } from "../../lib/tasksApi";
import type { Task } from "../../types";
import { formatFullNameForDisplay } from "../../lib/normalizeFullName";

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (task: Task) => void;
  defaultAssigneeUid?: string;
  defaultRelatedReportId?: string;
  defaultRelatedReportLabel?: string;
}

export function TaskDialog({
  open,
  onOpenChange,
  onCreated,
  defaultAssigneeUid,
  defaultRelatedReportId,
  defaultRelatedReportLabel
}: TaskDialogProps) {
  const usersDirectory = useUsersDirectory();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeUids, setAssigneeUids] = useState<string[]>(defaultAssigneeUid ? [defaultAssigneeUid] : []);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function setDueInDays(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setDueDate(date.toISOString().slice(0, 10));
  }

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setAssigneeUids(defaultAssigneeUid ? [defaultAssigneeUid] : []);
      setAssigneeSearch("");
      setDueDate("");
    }
  }, [open, defaultAssigneeUid]);

  const candidates = useMemo(() => {
    const normalizedSearch = assigneeSearch.trim().toLowerCase();
    const base = usersDirectory.users.filter((u) => u.role !== "admin");
    if (!normalizedSearch) return base;
    return base.filter((u) => {
      const fullName = formatFullNameForDisplay(u.fullName).toLowerCase();
      const position = String(u.position || "").toLowerCase();
      return fullName.includes(normalizedSearch) || position.includes(normalizedSearch);
    });
  }, [usersDirectory.users, assigneeSearch]);

  function toggleAssignee(uid: string) {
    setAssigneeUids((prev) => (prev.includes(uid) ? prev.filter((item) => item !== uid) : [...prev, uid]));
  }

  function selectAllVisible() {
    setAssigneeUids((prev) => {
      const next = new Set(prev);
      for (const candidate of candidates) next.add(candidate.uid);
      return Array.from(next);
    });
  }

  function clearSelected() {
    setAssigneeUids([]);
  }

  async function submit() {
    if (!title.trim()) {
      toast.error("Введите заголовок задачи.");
      return;
    }
    if (!assigneeUids.length) {
      toast.error("Выберите хотя бы одного исполнителя.");
      return;
    }
    setSubmitting(true);
    try {
      const createdTasks = await Promise.all(
        assigneeUids.map((assigneeUid) =>
          createTask({
            title: title.trim(),
            description: description.trim() || undefined,
            assigneeUid,
            dueDate: dueDate || undefined,
            relatedReportId: defaultRelatedReportId || undefined,
            relatedReportLabel: defaultRelatedReportLabel || undefined
          })
        )
      );
      const successful = createdTasks.filter((task): task is Task => Boolean(task));
      if (successful.length > 0) {
        toast.success(
          successful.length === 1
            ? "Задача создана."
            : `Создано задач: ${successful.length}.`
        );
        successful.forEach((task) => onCreated?.(task));
        onOpenChange(false);
      } else {
        toast.error("Не удалось создать задачи.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось создать задачу.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-3 sm:p-5">
        <DialogTitle>Новая задача</DialogTitle>
        <div className="max-h-[80vh] space-y-3 overflow-y-auto pr-0.5 sm:max-h-[76vh] sm:pr-1">
          <div>
            <Label htmlFor="task-title">Заголовок</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: уточнить тип изоляции"
            />
          </div>
          <div>
            <Label htmlFor="task-description">Описание (опционально)</Label>
            <textarea
              id="task-description"
              className="min-h-[80px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm theme-dark:border-slate-700 theme-dark:bg-slate-900"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="task-assignee">Исполнитель</Label>
            <Input
              id="task-assignee"
              value={assigneeSearch}
              onChange={(e) => setAssigneeSearch(e.target.value)}
              placeholder="Поиск по ФИО или должности"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" className="h-10" onClick={selectAllVisible}>
                Выбрать всех видимых
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-10" onClick={clearSelected}>
                Очистить
              </Button>
              <span className="text-xs text-slate-500 theme-dark:text-slate-400">
                Выбрано: {assigneeUids.length}
              </span>
            </div>
            <div className="mt-2 max-h-52 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2 sm:max-h-64 theme-dark:border-slate-700 theme-dark:bg-slate-900/60">
              {!candidates.length ? (
                <div className="px-2 py-1 text-xs text-slate-500 theme-dark:text-slate-400">Никого не найдено.</div>
              ) : (
                candidates.map((u) => {
                  const checked = assigneeUids.includes(u.uid);
                  return (
                    <label
                      key={u.uid}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-white theme-dark:hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 theme-dark:border-slate-600"
                        checked={checked}
                        onChange={() => toggleAssignee(u.uid)}
                      />
                      <span>
                        {formatFullNameForDisplay(u.fullName)}
                        {u.position ? ` · ${u.position}` : ""}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="task-due">Срок исполнения</Label>
            <Input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setDueInDays(0)}>
                Сегодня
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setDueInDays(3)}>
                +3 дня
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setDueInDays(7)}>
                +7 дней
              </Button>
              {dueDate ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setDueDate("")}>
                  Без срока
                </Button>
              ) : null}
            </div>
          </div>
          {defaultRelatedReportLabel ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 theme-dark:border-slate-700 theme-dark:bg-slate-800/70 theme-dark:text-slate-300">
              Связанный отчёт: {defaultRelatedReportLabel}
            </div>
          ) : null}
          <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-slate-200 bg-white/95 pt-3 backdrop-blur sm:flex-row sm:justify-end theme-dark:border-slate-700 theme-dark:bg-slate-950/95">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="button" className="w-full sm:w-auto" disabled={submitting} onClick={submit}>
              {submitting ? "Создание…" : "Создать задачу"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
