import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

interface AnomalyItem {
  reportId: string;
  reason: string;
  reportDate: string;
  authorName?: string;
}

interface AnomalyListProps {
  items: AnomalyItem[];
  emptyText?: string;
  max?: number;
}

export function AnomalyList({ items, emptyText = "Аномалий не обнаружено.", max = 5 }: AnomalyListProps) {
  if (!items.length) {
    return <div className="text-sm text-slate-500 theme-dark:text-slate-400">{emptyText}</div>;
  }
  const sliced = items.slice(0, max);
  return (
    <div className="space-y-2">
      {sliced.map((a, i) => (
        <Link
          key={`${a.reportId}-${i}`}
          to={a.reportId ? `/report/${a.reportId}` : "/director/reports"}
          className="pretty-list-item flex items-center justify-between gap-2 border-amber-200/80 bg-amber-50/80 theme-dark:border-amber-700/60 theme-dark:bg-amber-900/30"
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 theme-dark:text-amber-400" aria-hidden />
            <div className="min-w-0">
              <div className="truncate font-medium text-amber-900 theme-dark:text-amber-200">{a.reason}</div>
              <div className="truncate text-[11px] text-amber-700 theme-dark:text-amber-300">
                {a.authorName ? `${a.authorName} · ` : ""}
                {a.reportDate}
              </div>
            </div>
          </div>
        </Link>
      ))}
      {items.length > max ? (
        <div className="text-[11px] text-slate-500 theme-dark:text-slate-400">
          И ещё {items.length - max}…
        </div>
      ) : null}
    </div>
  );
}
