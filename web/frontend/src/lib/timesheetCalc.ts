import { formatFullNameForDisplay } from "./normalizeFullName";
import { getReportedPipeVolume, inferPipeWorkKind } from "./pipeWorkKind";
import type { WorkRates } from "./workRates";
import type { CrewMemberRef, PipeWorkKind, Report } from "../types";

export type TimesheetQuantities = {
  shiftDays: number;
  shiftMoneySum: number;
  pipelineMountM2: number;
  equipmentMountM2: number;
  demountM2: number;
  foilPm: number;
};

export type TimesheetAmounts = {
  shiftDay: number;
  shiftMoney: number;
  pipeline: number;
  equipment: number;
  demount: number;
  foil: number;
  total: number;
};

export type TimesheetLine = {
  reportId: string;
  reportDate: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
};

export type InsulatorTimesheet = {
  uid: string;
  fullName: string;
  position?: string;
  quantities: TimesheetQuantities;
  amounts: TimesheetAmounts;
  reportIds: string[];
  lines: TimesheetLine[];
};

function emptyQuantities(): TimesheetQuantities {
  return {
    shiftDays: 0,
    shiftMoneySum: 0,
    pipelineMountM2: 0,
    equipmentMountM2: 0,
    demountM2: 0,
    foilPm: 0
  };
}

function addQuantities(target: TimesheetQuantities, patch: Partial<TimesheetQuantities>) {
  if (patch.shiftDays) target.shiftDays += patch.shiftDays;
  if (patch.shiftMoneySum) target.shiftMoneySum += patch.shiftMoneySum;
  if (patch.pipelineMountM2) target.pipelineMountM2 += patch.pipelineMountM2;
  if (patch.equipmentMountM2) target.equipmentMountM2 += patch.equipmentMountM2;
  if (patch.demountM2) target.demountM2 += patch.demountM2;
  if (patch.foilPm) target.foilPm += patch.foilPm;
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function amountsFromQuantities(q: TimesheetQuantities, rates: WorkRates): TimesheetAmounts {
  const shiftDay = round2(q.shiftDays * rates.shift_day);
  const shiftMoney = round2(q.shiftMoneySum * rates.shift_money_unit);
  const pipeline = round2(q.pipelineMountM2 * rates.pipeline_mount_m2);
  const equipment = round2(q.equipmentMountM2 * rates.equipment_mount_m2);
  const demount = round2(q.demountM2 * rates.pipeline_demount_m2);
  const foil = round2(q.foilPm * rates.shift_foil_pm);
  return {
    shiftDay,
    shiftMoney,
    pipeline,
    equipment,
    demount,
    foil,
    total: round2(shiftDay + shiftMoney + pipeline + equipment + demount + foil)
  };
}

type WorkerBucket = {
  uid: string;
  fullName: string;
  position?: string;
  quantities: TimesheetQuantities;
  reportIds: Set<string>;
  lines: TimesheetLine[];
};

function getBucket(map: Map<string, WorkerBucket>, member: CrewMemberRef): WorkerBucket {
  let row = map.get(member.uid);
  if (!row) {
    row = {
      uid: member.uid,
      fullName: formatFullNameForDisplay(member.fullName),
      position: member.position,
      quantities: emptyQuantities(),
      reportIds: new Set(),
      lines: []
    };
    map.set(member.uid, row);
  }
  return row;
}

function assigneesForPipe(report: Report, pipe: Report["pipes"][0]): CrewMemberRef[] {
  if (pipe.crewMembers?.length) return pipe.crewMembers;
  return [
    {
      uid: report.userId,
      fullName: report.submittedByFullName || report.fullName || report.userEmail,
      position: undefined
    }
  ];
}

function quantityPatchForKind(kind: PipeWorkKind, volume: number): Partial<TimesheetQuantities> {
  if (kind === "pipeline_mount") return { pipelineMountM2: volume };
  if (kind === "equipment_mount") return { equipmentMountM2: volume };
  if (kind === "pipeline_demount") return { demountM2: volume };
  return { foilPm: volume };
}

function unitForKind(kind: PipeWorkKind): string {
  return kind === "shift_foil" ? "п.м." : "м²";
}

function rateForKind(kind: PipeWorkKind, rates: WorkRates): number {
  if (kind === "pipeline_mount") return rates.pipeline_mount_m2;
  if (kind === "equipment_mount") return rates.equipment_mount_m2;
  if (kind === "pipeline_demount") return rates.pipeline_demount_m2;
  return rates.shift_foil_pm;
}

function labelForKind(kind: PipeWorkKind): string {
  if (kind === "pipeline_mount") return "Монтаж труб";
  if (kind === "equipment_mount") return "Монтаж оборуд.";
  if (kind === "pipeline_demount") return "Демонтаж";
  return "Фольга-ткань";
}

function accumulateReport(map: Map<string, WorkerBucket>, report: Report, rates: WorkRates) {
  const reportId = report.id ?? `${report.userId}-${report.date}-${report.createdAt}`;
  const owner: CrewMemberRef = {
    uid: report.userId,
    fullName: report.submittedByFullName || report.fullName || report.userEmail
  };

  if (report.shiftWork && report.shiftWork.value > 0) {
    const bucket = getBucket(map, owner);
    bucket.reportIds.add(reportId);
    if (report.shiftWork.type === "money") {
      const sum = report.shiftWork.value;
      addQuantities(bucket.quantities, { shiftMoneySum: sum });
      bucket.lines.push({
        reportId,
        reportDate: report.date,
        description: "Работа за смену (сумма)",
        quantity: sum,
        unit: "₽",
        rate: rates.shift_money_unit,
        amount: round2(sum * rates.shift_money_unit)
      });
    } else {
      const days = report.shiftWork.value;
      addQuantities(bucket.quantities, { shiftDays: days });
      bucket.lines.push({
        reportId,
        reportDate: report.date,
        description: "Работа за часы (смена)",
        quantity: days,
        unit: "смена",
        rate: rates.shift_day,
        amount: round2(days * rates.shift_day)
      });
    }
  }

  for (const pipe of report.pipes) {
    const kind = inferPipeWorkKind(pipe);
    const vol = getReportedPipeVolume(pipe);
    if (vol <= 0) continue;
    const members = assigneesForPipe(report, pipe);
    const share = vol / members.length;
    const unit = unitForKind(kind);
    const rate = rateForKind(kind, rates);
    const site = pipe.siteName?.trim() || "—";
    for (const member of members) {
      const bucket = getBucket(map, member);
      bucket.reportIds.add(reportId);
      addQuantities(bucket.quantities, quantityPatchForKind(kind, share));
      bucket.lines.push({
        reportId,
        reportDate: report.date,
        description: `${labelForKind(kind)} · ${site}${members.length > 1 ? " (доля)" : ""}`,
        quantity: round2(share),
        unit,
        rate,
        amount: round2(share * rate)
      });
    }
  }
}

export function buildTimesheetsFromReports(
  reports: Report[],
  rates: WorkRates,
  options: { onlyApproved?: boolean } = {}
): InsulatorTimesheet[] {
  const onlyApproved = options.onlyApproved !== false;
  const map = new Map<string, WorkerBucket>();

  for (const report of reports) {
    const status = report.status ?? "submitted";
    if (onlyApproved && status !== "approved") continue;
    if (!onlyApproved && status === "needs_fix") continue;
    if (!report.userId) continue;
    accumulateReport(map, report, rates);
  }

  return Array.from(map.values())
    .map((row) => ({
      uid: row.uid,
      fullName: row.fullName,
      position: row.position,
      quantities: {
        shiftDays: round2(row.quantities.shiftDays),
        shiftMoneySum: round2(row.quantities.shiftMoneySum),
        pipelineMountM2: round2(row.quantities.pipelineMountM2),
        equipmentMountM2: round2(row.quantities.equipmentMountM2),
        demountM2: round2(row.quantities.demountM2),
        foilPm: round2(row.quantities.foilPm)
      },
      amounts: amountsFromQuantities(row.quantities, rates),
      reportIds: Array.from(row.reportIds),
      lines: row.lines.sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    }))
    .filter((row) => row.reportIds.length > 0 || row.amounts.total > 0)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
}

export function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2
  }).format(n);
}
