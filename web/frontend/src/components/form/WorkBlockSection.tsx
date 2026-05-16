import type { ReactNode } from "react";
import { Card, CardContent } from "../ui/card";
import { cn } from "../../lib/utils";

export type WorkBlockTone = "hours" | "pipeline" | "equipment" | "demount";

const WORK_BLOCK_STYLES: Record<
  WorkBlockTone,
  { card: string; header: string; icon: string; step: string; inner: string }
> = {
  hours: {
    card: "border-l-[5px] border-l-amber-500 border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-slate-50/90 shadow-md shadow-amber-900/5 theme-dark:border-amber-700/50 theme-dark:border-l-amber-400 theme-dark:from-amber-950/35 theme-dark:to-slate-900/80 theme-dark:shadow-amber-950/20",
    header: "border-b border-amber-200/70 bg-amber-100/50 theme-dark:border-amber-800/40 theme-dark:bg-amber-950/25",
    icon: "border-amber-300/80 bg-amber-200/80 text-amber-900 theme-dark:border-amber-700 theme-dark:bg-amber-900/50 theme-dark:text-amber-200",
    step: "bg-amber-500 text-white theme-dark:bg-amber-600",
    inner: "border-amber-200/60 bg-white/70 theme-dark:border-amber-800/40 theme-dark:bg-slate-900/50"
  },
  pipeline: {
    card: "border-l-[5px] border-l-sky-500 border-sky-200/90 bg-gradient-to-br from-sky-50/95 to-slate-50/90 shadow-md shadow-sky-900/5 theme-dark:border-sky-700/50 theme-dark:border-l-sky-400 theme-dark:from-sky-950/35 theme-dark:to-slate-900/80 theme-dark:shadow-sky-950/20",
    header: "border-b border-sky-200/70 bg-sky-100/50 theme-dark:border-sky-800/40 theme-dark:bg-sky-950/25",
    icon: "border-sky-300/80 bg-sky-200/80 text-sky-900 theme-dark:border-sky-700 theme-dark:bg-sky-900/50 theme-dark:text-sky-200",
    step: "bg-sky-500 text-white theme-dark:bg-sky-600",
    inner: "border-sky-200/60 bg-white/70 theme-dark:border-sky-800/40 theme-dark:bg-slate-900/50"
  },
  equipment: {
    card: "border-l-[5px] border-l-emerald-500 border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 to-slate-50/90 shadow-md shadow-emerald-900/5 theme-dark:border-emerald-700/50 theme-dark:border-l-emerald-400 theme-dark:from-emerald-950/35 theme-dark:to-slate-900/80 theme-dark:shadow-emerald-950/20",
    header: "border-b border-emerald-200/70 bg-emerald-100/50 theme-dark:border-emerald-800/40 theme-dark:bg-emerald-950/25",
    icon: "border-emerald-300/80 bg-emerald-200/80 text-emerald-900 theme-dark:border-emerald-700 theme-dark:bg-emerald-900/50 theme-dark:text-emerald-200",
    step: "bg-emerald-500 text-white theme-dark:bg-emerald-600",
    inner: "border-emerald-200/60 bg-white/70 theme-dark:border-emerald-800/40 theme-dark:bg-slate-900/50"
  },
  demount: {
    card: "border-l-[5px] border-l-rose-500 border-rose-200/90 bg-gradient-to-br from-rose-50/95 to-slate-50/90 shadow-md shadow-rose-900/5 theme-dark:border-rose-700/50 theme-dark:border-l-rose-400 theme-dark:from-rose-950/35 theme-dark:to-slate-900/80 theme-dark:shadow-rose-950/20",
    header: "border-b border-rose-200/70 bg-rose-100/50 theme-dark:border-rose-800/40 theme-dark:bg-rose-950/25",
    icon: "border-rose-300/80 bg-rose-200/80 text-rose-900 theme-dark:border-rose-700 theme-dark:bg-rose-900/50 theme-dark:text-rose-200",
    step: "bg-rose-500 text-white theme-dark:bg-rose-600",
    inner: "border-rose-200/60 bg-white/70 theme-dark:border-rose-800/40 theme-dark:bg-slate-900/50"
  }
};

export function workCardClass(tone: WorkBlockTone): string {
  return cn("rounded-2xl border p-3 shadow-sm", WORK_BLOCK_STYLES[tone].inner);
}

export function WorkBlockSection({
  tone,
  step,
  icon,
  title,
  subtitle,
  children
}: {
  tone: WorkBlockTone;
  step: number;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const styles = WORK_BLOCK_STYLES[tone];
  return (
    <Card className={cn("animate-in-up overflow-hidden", styles.card)}>
      <div className={cn("px-3 py-3 sm:px-4 sm:py-3.5", styles.header)}>
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums shadow-sm",
              styles.step
            )}
            aria-hidden
          >
            {step}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold tracking-tight text-slate-900 theme-dark:text-slate-50">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-600 theme-dark:text-slate-300 sm:text-sm">
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className={cn("shrink-0 rounded-xl border p-2.5 shadow-sm", styles.icon)}>{icon}</div>
        </div>
      </div>
      <CardContent className="space-y-3 p-3 sm:p-4">{children}</CardContent>
    </Card>
  );
}
