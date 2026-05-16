export const DEFAULT_WORK_RATES = {
  shift_day: 0,
  shift_money_unit: 1,
  pipeline_mount_m2: 0,
  equipment_mount_m2: 0,
  pipeline_demount_m2: 0,
  shift_foil_pm: 0
};

const RATE_KEYS = Object.keys(DEFAULT_WORK_RATES);

export function normalizeWorkRates(raw) {
  const out = { ...DEFAULT_WORK_RATES };
  if (!raw || typeof raw !== "object") return out;
  for (const key of RATE_KEYS) {
    const n = Number(raw[key]);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  if (typeof raw.updatedAt === "string") out.updatedAt = raw.updatedAt;
  if (typeof raw.updatedByUid === "string") out.updatedByUid = raw.updatedByUid;
  return out;
}
