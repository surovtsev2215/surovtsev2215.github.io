import { formatFullNameForDisplay } from "../../lib/normalizeFullName";
import { getReportStatus } from "../../lib/reportPermissions";
import type { Report } from "../../types";
import { ReportStatusBadge } from "./ReportStatusBadge";

export function ReportReviewNotice({ report, compact }: { report: Report; compact?: boolean }) {
  const status = getReportStatus(report);
  const review = report.review;

  if (status === "submitted" && !review?.note?.trim()) {
    return (
      <div
        className={
          compact
            ? "flex flex-wrap items-center gap-2 text-xs text-slate-500 theme-dark:text-slate-400"
            : "rounded-xl border border-sky-200/80 bg-sky-50/90 px-3 py-2.5 text-sm text-sky-950 theme-dark:border-sky-800/60 theme-dark:bg-sky-950/30 theme-dark:text-sky-100"
        }
      >
        <ReportStatusBadge status={status} />
        {!compact && (
          <span>Отчёт отправлен на проверку ИТР. Редактирование доступно до согласования.</span>
        )}
        {compact && <span>Ожидает проверки ИТР</span>}
      </div>
    );
  }

  if (status === "approved") {
    return (
      <div
        className={
          compact
            ? "flex flex-wrap items-center gap-2 text-xs"
            : "rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2.5 text-sm text-emerald-950 theme-dark:border-emerald-800/60 theme-dark:bg-emerald-950/30 theme-dark:text-emerald-100"
        }
      >
        <ReportStatusBadge status={status} />
        {review && !compact ? (
          <span className="text-xs text-emerald-800/90 theme-dark:text-emerald-200/90">
            {formatFullNameForDisplay(review.byFullName || "ИТР")}
            {review.decidedAt
              ? ` · ${new Date(review.decidedAt).toLocaleString("ru-RU")}`
              : ""}
          </span>
        ) : null}
        {!compact && review?.note?.trim() ? (
          <p className="mt-1 w-full whitespace-pre-wrap text-sm">{review.note}</p>
        ) : null}
      </div>
    );
  }

  if (status === "needs_fix") {
    return (
      <div
        className={
          compact
            ? "space-y-1"
            : "rounded-xl border border-amber-200/80 bg-amber-50/95 px-3 py-2.5 text-sm text-amber-950 theme-dark:border-amber-800/60 theme-dark:bg-amber-950/35 theme-dark:text-amber-100"
        }
        role="alert"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ReportStatusBadge status={status} />
          {!compact && (
            <span className="font-medium">ИТР вернул отчёт на доработку. Исправьте замечания и отправьте снова.</span>
          )}
        </div>
        {review ? (
          <div className={compact ? "text-xs text-amber-900/90 theme-dark:text-amber-100/90" : "mt-2 space-y-1"}>
            <div className="text-xs text-amber-800/80 theme-dark:text-amber-200/80">
              {formatFullNameForDisplay(review.byFullName || "ИТР")}
              {review.byPosition ? ` · ${review.byPosition}` : ""}
              {review.decidedAt
                ? ` · ${new Date(review.decidedAt).toLocaleString("ru-RU")}`
                : ""}
            </div>
            {review.note?.trim() ? (
              <p className="whitespace-pre-wrap font-medium">{review.note}</p>
            ) : (
              <p className="text-xs opacity-90">Комментарий ИТР не указан — уточните у руководителя.</p>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}
