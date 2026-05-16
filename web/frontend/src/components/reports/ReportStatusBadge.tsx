import type { ReportReviewStatus } from "../../types";

export const REPORT_STATUS_LABELS: Record<ReportReviewStatus, string> = {
  submitted: "На согласовании",
  approved: "Согласован",
  needs_fix: "На доработку"
};

export function ReportStatusBadge({ status }: { status: ReportReviewStatus }) {
  const cls =
    status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 theme-dark:border-emerald-800 theme-dark:bg-emerald-950/40 theme-dark:text-emerald-300"
      : status === "needs_fix"
        ? "border-amber-200 bg-amber-50 text-amber-800 theme-dark:border-amber-800 theme-dark:bg-amber-950/40 theme-dark:text-amber-300"
        : "border-sky-200 bg-sky-50 text-sky-700 theme-dark:border-sky-800 theme-dark:bg-sky-950/40 theme-dark:text-sky-300";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {REPORT_STATUS_LABELS[status]}
    </span>
  );
}
