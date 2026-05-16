import type { PipeDraft } from "../hooks/usePipeList";
import { inferPipeWorkKind } from "./pipeWorkKind";
import type { PipeEntry, Report, ShiftWorkType } from "../types";

function localIdFromPipeId(pipeId: string, prefix: string): string {
  if (pipeId.startsWith(prefix)) return pipeId.slice(prefix.length);
  return crypto.randomUUID();
}

function pipeToDraft(pipe: PipeEntry): PipeDraft {
  const kind = inferPipeWorkKind(pipe);
  const prefix =
    kind === "shift_foil"
      ? "shift-"
      : kind === "pipeline_demount"
        ? "equipment-"
        : kind === "equipment_mount"
          ? "equipment-extra-"
          : "pipe-";
  return {
    localId: localIdFromPipeId(pipe.id, prefix),
    siteName: pipe.siteName ?? "",
    diameter: typeof pipe.diameter === "number" ? pipe.diameter : 0,
    insulationType: pipe.insulationType ?? "",
    jointsCount: typeof pipe.jointsCount === "number" ? pipe.jointsCount : 1,
    pipeLength: typeof pipe.pipeLength === "number" ? pipe.pipeLength : pipe.totalLength,
    comments: pipe.comments ?? "",
    photos: [],
    keptPhotoUrls: [...(pipe.photoUrls ?? [])],
    crewMembers: pipe.crewMembers ?? []
  };
}

export type ReportFormHydration = {
  date: string;
  fullName: string;
  shiftType: ShiftWorkType;
  shiftValue: number;
  isolatorWorkDescription: string;
  keptShiftPhotoUrls: string[];
  shiftWorkPipes: string[];
  shiftPipes: PipeDraft[];
  pipelinePipes: PipeDraft[];
  equipmentPipes: PipeDraft[];
  extraEquipmentPipes: PipeDraft[];
};

export function hydrateReportToForm(report: Report): ReportFormHydration {
  const shiftPipes: PipeDraft[] = [];
  const pipelinePipes: PipeDraft[] = [];
  const equipmentPipes: PipeDraft[] = [];
  const extraEquipmentPipes: PipeDraft[] = [];

  for (const pipe of report.pipes) {
    const draft = pipeToDraft(pipe);
    const kind = inferPipeWorkKind(pipe);
    if (kind === "shift_foil") shiftPipes.push(draft);
    else if (kind === "pipeline_mount") pipelinePipes.push(draft);
    else if (kind === "pipeline_demount") equipmentPipes.push(draft);
    else if (kind === "equipment_mount") extraEquipmentPipes.push(draft);
  }

  const hasShiftExtras =
    !!report.shiftWork?.value ||
    !!report.shiftWorkDescription?.trim() ||
    !!(report.shiftWorkPhotoUrls?.length) ||
    !!(report.shiftWorkPipes?.length) ||
    shiftPipes.length > 0;

  return {
    date: report.date,
    fullName: report.fullName ?? "",
    shiftType: report.shiftWork?.type === "money" ? "money" : "hours",
    shiftValue: hasShiftExtras ? Math.max(1, report.shiftWork?.value ?? 1) : 0,
    isolatorWorkDescription: report.shiftWorkDescription ?? report.comments ?? "",
    keptShiftPhotoUrls: [...(report.shiftWorkPhotoUrls ?? [])],
    shiftWorkPipes: [...(report.shiftWorkPipes ?? [])],
    shiftPipes,
    pipelinePipes,
    equipmentPipes,
    extraEquipmentPipes
  };
}
