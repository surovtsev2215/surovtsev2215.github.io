import type { PipeEntry, PipeWorkKind, Report } from "../types";
import { formatCrewLine } from "./brigade";

export const PIPE_WORK_LABELS: Record<PipeWorkKind, { short: string; section: string }> = {
  pipeline_mount: { short: "Монтаж · трубы", section: "Теплоизоляция трубопроводов" },
  equipment_mount: { short: "Монтаж · оборуд.", section: "Теплоизоляция оборудования" },
  pipeline_demount: { short: "Демонтаж ТИ", section: "Демонтаж ТИ на трубопроводах" },
  shift_foil: { short: "Фольга-ткань", section: "Работа за часы · фольга-ткань" }
};

export function inferPipeWorkKind(pipe: Pick<PipeEntry, "id" | "workKind">): PipeWorkKind {
  if (pipe.workKind) return pipe.workKind;
  const id = pipe.id ?? "";
  if (id.startsWith("equipment-extra-")) return "equipment_mount";
  if (id.startsWith("equipment-")) return "pipeline_demount";
  if (id.startsWith("shift-")) return "shift_foil";
  return "pipeline_mount";
}

export type ReportWorkSummary = {
  pipelineMountM2: number;
  equipmentMountM2: number;
  demountM2: number;
  foilPm: number;
  photoCount: number;
  hasShiftPhotos: boolean;
};

/** Объём, который учитывается в сводке отчёта (Σ м² / п.м.). */
export function getReportedPipeVolume(pipe: PipeEntry): number {
  const kind = inferPipeWorkKind(pipe);
  if (kind === "shift_foil") {
    return pipe.pipeLength ?? pipe.totalLength ?? 0;
  }
  return pipe.totalLength ?? pipe.pipeLength ?? 0;
}

export function getReportWorkSummary(report: Report): ReportWorkSummary {
  let pipelineMountM2 = 0;
  let equipmentMountM2 = 0;
  let demountM2 = 0;
  let foilPm = 0;
  let photoCount = report.shiftPhotoCount ?? report.shiftWorkPhotoUrls?.length ?? 0;

  for (const pipe of report.pipes) {
    const kind = inferPipeWorkKind(pipe);
    const vol = getReportedPipeVolume(pipe);
    photoCount += pipe.pipePhotoCount ?? pipe.photoUrls?.length ?? 0;
    if (kind === "pipeline_mount") pipelineMountM2 += vol;
    else if (kind === "equipment_mount") equipmentMountM2 += vol;
    else if (kind === "pipeline_demount") demountM2 += vol;
    else if (kind === "shift_foil") foilPm += vol;
  }

  return {
    pipelineMountM2: Number(pipelineMountM2.toFixed(2)),
    equipmentMountM2: Number(equipmentMountM2.toFixed(2)),
    demountM2: Number(demountM2.toFixed(2)),
    foilPm: Number(foilPm.toFixed(2)),
    photoCount,
    hasShiftPhotos: (report.shiftPhotoCount ?? report.shiftWorkPhotoUrls?.length ?? 0) > 0
  };
}

export function formatWorkSummaryLine(summary: ReportWorkSummary): string {
  const parts: string[] = [];
  if (summary.pipelineMountM2 > 0) parts.push(`Монтаж ${summary.pipelineMountM2} м²`);
  if (summary.demountM2 > 0) parts.push(`Демонтаж ${summary.demountM2} м²`);
  if (summary.equipmentMountM2 > 0) parts.push(`Оборуд. ${summary.equipmentMountM2} м²`);
  if (summary.foilPm > 0) parts.push(`Фольга ${summary.foilPm} п.м.`);
  return parts.length ? parts.join(" · ") : "—";
}

export function getPipeDisplayFields(
  pipe: PipeEntry,
  workBlock?: string
): { label: string; value: string }[] {
  const kind = inferPipeWorkKind(pipe);
  const dia = pipe.diameter ? `${String(pipe.diameter).replace(".", ",")} мм` : "—";
  const vol = getReportedPipeVolume(pipe);
  const blockField =
    workBlock?.trim() ?
      [{ label: "Блок производства работ", value: workBlock.trim() }]
    : [];
  const crewLine = formatCrewLine(pipe.crewMembers);
  const crewField = crewLine ? [{ label: "Участники", value: crewLine }] : [];

  if (kind === "pipeline_demount") {
    return [
      ...blockField,
      ...crewField,
      { label: "Трубопровод", value: pipe.siteName || "—" },
      { label: "Диаметр", value: dia },
      { label: "Объём демонтажа", value: `${vol} м²` }
    ];
  }
  if (kind === "equipment_mount") {
    return [
      ...blockField,
      ...crewField,
      { label: "Оборудование", value: pipe.siteName || "—" },
      { label: "Толщина ваты", value: pipe.insulationType || "—" },
      { label: "Толщина алюминия", value: pipe.jointsCount ? `${pipe.jointsCount} мм` : "—" },
      { label: "Выполненный объём", value: `${vol} м²` }
    ];
  }
  if (kind === "shift_foil") {
    return [
      ...blockField,
      ...crewField,
      { label: "Линия", value: pipe.siteName || "—" },
      { label: "Покрывной слой", value: pipe.insulationType || "Фольга-ткань" },
      { label: "Выполненный объём", value: `${vol} п.м.` }
    ];
  }
  return [
    ...blockField,
    ...crewField,
    { label: "Линия трубопровода", value: pipe.siteName || "—" },
    { label: "Диаметр", value: dia },
    { label: "Толщина ваты", value: pipe.insulationType || "—" },
    { label: "Толщина алюминия", value: pipe.jointsCount ? `${pipe.jointsCount} мм` : "—" },
    { label: "Выполненный объём", value: `${vol} м²` }
  ];
}

export function groupPipesByWorkKind(pipes: PipeEntry[]): Map<PipeWorkKind, PipeEntry[]> {
  const order: PipeWorkKind[] = ["shift_foil", "pipeline_mount", "equipment_mount", "pipeline_demount"];
  const map = new Map<PipeWorkKind, PipeEntry[]>();
  for (const kind of order) map.set(kind, []);
  for (const pipe of pipes) {
    const kind = inferPipeWorkKind(pipe);
    map.get(kind)!.push(pipe);
  }
  return map;
}
