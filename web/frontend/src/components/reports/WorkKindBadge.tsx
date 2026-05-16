import { PIPE_WORK_LABELS } from "../../lib/pipeWorkKind";
import type { PipeWorkKind } from "../../types";
import { cn } from "../../lib/utils";

const STYLES: Record<PipeWorkKind, string> = {
  pipeline_mount:
    "border-sky-200 bg-sky-50 text-sky-800 theme-dark:border-sky-800 theme-dark:bg-sky-950/50 theme-dark:text-sky-200",
  equipment_mount:
    "border-emerald-200 bg-emerald-50 text-emerald-800 theme-dark:border-emerald-800 theme-dark:bg-emerald-950/50 theme-dark:text-emerald-200",
  pipeline_demount:
    "border-amber-200 bg-amber-50 text-amber-800 theme-dark:border-amber-800 theme-dark:bg-amber-950/50 theme-dark:text-amber-200",
  shift_foil:
    "border-violet-200 bg-violet-50 text-violet-800 theme-dark:border-violet-800 theme-dark:bg-violet-950/50 theme-dark:text-violet-200"
};

export function WorkKindBadge({
  kind,
  className
}: {
  kind: PipeWorkKind;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        STYLES[kind],
        className
      )}
    >
      {PIPE_WORK_LABELS[kind].short}
    </span>
  );
}
