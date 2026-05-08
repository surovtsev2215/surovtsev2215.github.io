import { useNavigate } from "react-router-dom";

interface SiteTopListProps {
  items: Array<[string, number]>;
  basePath?: string;
  emptyText?: string;
}

export function SiteTopList({ items, basePath = "/director/reports", emptyText = "Нет данных за выбранный период." }: SiteTopListProps) {
  const navigate = useNavigate();
  if (!items.length) {
    return <div className="text-sm text-slate-500 theme-dark:text-slate-400">{emptyText}</div>;
  }
  return (
    <div className="space-y-2">
      {items.map(([site, value]) => (
        <button
          key={site}
          type="button"
          className="pretty-list-item flex w-full items-center justify-between text-left"
          onClick={() => navigate(`${basePath}?site=${encodeURIComponent(site)}`)}
        >
          <span className="truncate">{site}</span>
          <span className="font-semibold">{value.toFixed(1)} м</span>
        </button>
      ))}
    </div>
  );
}
