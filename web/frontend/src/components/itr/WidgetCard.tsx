import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "../ui/card";
import { cn } from "../../lib/utils";

interface WidgetCardProps {
  title: string;
  Icon?: LucideIcon;
  badge?: number;
  badgeTone?: "primary" | "warning" | "danger" | "success";
  actionLabel?: string;
  actionTo?: string;
  children: React.ReactNode;
  className?: string;
  description?: string;
}

export function WidgetCard({
  title,
  Icon,
  badge,
  badgeTone = "primary",
  actionLabel,
  actionTo,
  children,
  className,
  description
}: WidgetCardProps) {
  const tone =
    badgeTone === "warning"
      ? "bg-amber-100 text-amber-700 theme-dark:bg-amber-900/40 theme-dark:text-amber-300"
      : badgeTone === "danger"
        ? "bg-rose-100 text-rose-700 theme-dark:bg-rose-900/40 theme-dark:text-rose-300"
        : badgeTone === "success"
          ? "bg-emerald-100 text-emerald-700 theme-dark:bg-emerald-900/40 theme-dark:text-emerald-300"
          : "bg-primary/10 text-primary theme-dark:bg-accent/20 theme-dark:text-accent";
  return (
    <Card className={cn("soft-ring surface-floating", className)}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {Icon ? <Icon className="h-4 w-4 text-primary theme-dark:text-accent" aria-hidden /> : null}
              <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
              {typeof badge === "number" && badge > 0 ? (
                <span className={cn("inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold", tone)}>
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </div>
            {description ? (
              <p className="mt-1 text-xs text-slate-500 theme-dark:text-slate-400">{description}</p>
            ) : null}
          </div>
          {actionLabel && actionTo ? (
            <Link
              to={actionTo}
              className="shrink-0 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-white theme-dark:border-slate-700 theme-dark:bg-slate-800/70 theme-dark:text-slate-300 theme-dark:hover:bg-slate-800"
            >
              {actionLabel}
            </Link>
          ) : null}
        </div>
        <div>{children}</div>
      </CardContent>
    </Card>
  );
}
