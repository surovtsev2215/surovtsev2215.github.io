import { Link } from "react-router-dom";
import { formatFullNameForDisplay } from "../../lib/normalizeFullName";

interface EmployeeRowProps {
  uid: string;
  fullName?: string;
  position?: string;
  reports?: number;
  meters?: number;
  joints?: number;
  lastDate?: string;
  fallbackEmail?: string;
}

export function EmployeeRow({
  uid,
  fullName,
  position,
  reports,
  meters,
  joints,
  lastDate,
  fallbackEmail
}: EmployeeRowProps) {
  const display = fullName ? formatFullNameForDisplay(fullName) : fallbackEmail || "Неизвестный";
  const stats: string[] = [];
  if (typeof reports === "number") stats.push(`${reports} отч.`);
  if (typeof meters === "number") stats.push(`Σ ${meters.toFixed(1)} м`);
  if (typeof joints === "number") stats.push(`${joints} стык.`);
  if (lastDate) stats.push(`посл. ${lastDate}`);

  return (
    <Link
      to={`/director/reports?user=${encodeURIComponent(uid)}`}
      className="pretty-list-item flex items-center justify-between gap-2"
    >
      <div className="min-w-0">
        <div className="truncate font-medium">{display}</div>
        {position ? (
          <div className="truncate text-[11px] text-slate-500 theme-dark:text-slate-400">{position}</div>
        ) : null}
      </div>
      {stats.length > 0 ? (
        <div className="shrink-0 text-right text-[11px] text-slate-500 theme-dark:text-slate-400">
          {stats.join(" · ")}
        </div>
      ) : null}
    </Link>
  );
}
