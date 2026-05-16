import { apiRequest } from "./apiClient";
import { invalidateReportsListCache } from "./reportStore";
import { isApiConfigured } from "./runtimeConfig";
import type { Report, ReportReviewStatus } from "../types";

export async function submitReportReview(
  reportId: string,
  status: ReportReviewStatus,
  note?: string
): Promise<Report | null> {
  if (!isApiConfigured) return null;
  const { report } = await apiRequest<{ report: Report }>(`/api/reports/${reportId}/review`, {
    method: "POST",
    body: JSON.stringify({ status, note: note ?? "" })
  });
  invalidateReportsListCache();
  return report;
}
