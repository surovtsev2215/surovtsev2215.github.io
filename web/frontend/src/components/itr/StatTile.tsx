import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { cn } from "../../lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  Icon?: LucideIcon;
  hint?: string;
  tone?: "default" | "violet" | "emerald" | "amber" | "sky";
}

const toneRing: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "",
  violet:
    "ring-1 ring-violet-200 theme-dark:ring-violet-800/60",
  emerald:
    "ring-1 ring-emerald-200 theme-dark:ring-emerald-800/60",
  amber: "ring-1 ring-amber-200 theme-dark:ring-amber-800/60",
  sky: "ring-1 ring-sky-200 theme-dark:ring-sky-800/60"
};

export function StatTile({ label, value, Icon, hint, tone = "default" }: StatTileProps) {
  return (
    <Card className={cn("soft-ring kpi-glow surface-floating", toneRing[tone])}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500 theme-dark:text-slate-400">{label}</div>
          {Icon ? <Icon className="h-4 w-4 text-slate-400 theme-dark:text-slate-500" aria-hidden /> : null}
        </div>
        <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
        {hint ? (
          <div className="mt-1 text-[11px] text-slate-500 theme-dark:text-slate-400">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
