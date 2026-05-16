import type { Report } from "../types";
import { getReportWorkSummary } from "./pipeWorkKind";
import type { PeriodPreset } from "../hooks/useItrPeriod";

export interface ApprovedReportsSummary {
  reportsCount: number;
  uniqueBlocks: number;
  pipelineMountM2: number;
  equipmentMountM2: number;
  demountM2: number;
  foilPm: number;
  photoCount: number;
  topBlocks: Array<{ block: string; count: number }>;
}

const emptySummary: ApprovedReportsSummary = {
  reportsCount: 0,
  uniqueBlocks: 0,
  pipelineMountM2: 0,
  equipmentMountM2: 0,
  demountM2: 0,
  foilPm: 0,
  photoCount: 0,
  topBlocks: []
};

export function summarizeApprovedReports(reports: Report[]): ApprovedReportsSummary {
  if (!reports.length) return emptySummary;

  let pipelineMountM2 = 0;
  let equipmentMountM2 = 0;
  let demountM2 = 0;
  let foilPm = 0;
  let photoCount = 0;
  const blocks: Record<string, number> = {};

  for (const r of reports) {
    const s = getReportWorkSummary(r);
    pipelineMountM2 += s.pipelineMountM2;
    equipmentMountM2 += s.equipmentMountM2;
    demountM2 += s.demountM2;
    foilPm += s.foilPm;
    photoCount += s.photoCount;

    const block = r.fullName?.trim();
    if (block) blocks[block] = (blocks[block] ?? 0) + 1;
  }

  const topBlocks = Object.entries(blocks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([block, count]) => ({ block, count }));

  return {
    reportsCount: reports.length,
    uniqueBlocks: Object.keys(blocks).length,
    pipelineMountM2: Number(pipelineMountM2.toFixed(2)),
    equipmentMountM2: Number(equipmentMountM2.toFixed(2)),
    demountM2: Number(demountM2.toFixed(2)),
    foilPm: Number(foilPm.toFixed(2)),
    photoCount,
    topBlocks
  };
}

export function formatApprovedVolumeLine(summary: ApprovedReportsSummary): string {
  const parts: string[] = [];
  if (summary.pipelineMountM2 > 0) parts.push(`ТИ труб ${summary.pipelineMountM2} м²`);
  if (summary.demountM2 > 0) parts.push(`демонтаж ${summary.demountM2} м²`);
  if (summary.equipmentMountM2 > 0) parts.push(`ТИ оборуд. ${summary.equipmentMountM2} м²`);
  if (summary.foilPm > 0) parts.push(`фольга ${summary.foilPm} п.м.`);
  return parts.length ? parts.join(" · ") : "объёмы не указаны";
}

export function formatItrPeriodLabel(
  preset: PeriodPreset,
  range: { from: string; to: string }
): string {
  if (range.from || range.to) {
    if (range.from && range.to && range.from === range.to) return range.from;
    if (range.from && range.to) return `${range.from} — ${range.to}`;
    if (range.from) return `с ${range.from}`;
    if (range.to) return `по ${range.to}`;
  }
  if (preset === "today") return "за сегодня";
  if (preset === 7) return "за 7 дней";
  if (preset === 30) return "за 30 дней";
  return "за всё время";
}
