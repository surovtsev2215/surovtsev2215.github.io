import type { Report, ReportReviewStatus, UserRole } from "../types";

export function getReportStatus(report: Report): ReportReviewStatus {
  return (report.status ?? "submitted") as ReportReviewStatus;
}

/** Изолировщик может править/удалять до согласования ИТР; после «на доработку» — снова можно. */
export function canModifyReport(
  report: Report,
  uid?: string,
  role?: UserRole | null
): boolean {
  if (!report.id) return false;
  if (role === "admin" || role === "director") return true;
  if (!uid || report.userId !== uid) return false;
  return getReportStatus(report) !== "approved";
}

export function canEditReport(
  report: Report,
  uid?: string,
  role?: UserRole | null
): boolean {
  return canModifyReport(report, uid, role);
}

export function canDeleteReport(
  report: Report,
  uid?: string,
  role?: UserRole | null
): boolean {
  return canModifyReport(report, uid, role);
}
