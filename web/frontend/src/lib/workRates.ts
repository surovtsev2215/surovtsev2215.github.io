/** Ключи расценок (руб.) для расчёта табеля. */
export type WorkRateKey =
  | "shift_day"
  | "shift_money_unit"
  | "pipeline_mount_m2"
  | "equipment_mount_m2"
  | "pipeline_demount_m2"
  | "shift_foil_pm";

export type WorkRates = Record<WorkRateKey, number> & {
  updatedAt?: string;
  updatedByUid?: string;
};

export const WORK_RATE_LABELS: Record<
  WorkRateKey,
  { label: string; unit: string; hint: string }
> = {
  shift_day: {
    label: "Работа за часы (смена)",
    unit: "₽ / смена",
    hint: "Один день зачёта в блоке «Работа за часы»"
  },
  shift_money_unit: {
    label: "Сумма за смену (деньги)",
    unit: "коэфф.",
    hint: "Умножается на сумму из отчёта, если выбран тип «деньги»"
  },
  pipeline_mount_m2: {
    label: "Теплоизоляция трубопроводов",
    unit: "₽ / м²",
    hint: "Монтаж ТИ на трубопроводах"
  },
  equipment_mount_m2: {
    label: "Теплоизоляция оборудования",
    unit: "₽ / м²",
    hint: "Монтаж ТИ на оборудовании"
  },
  pipeline_demount_m2: {
    label: "Демонтаж ТИ",
    unit: "₽ / м²",
    hint: "Демонтаж на трубопроводах"
  },
  shift_foil_pm: {
    label: "Фольга-ткань",
    unit: "₽ / п.м.",
    hint: "Работа за часы · карточки фольма-ткань"
  }
};

export const WORK_RATE_KEYS = Object.keys(WORK_RATE_LABELS) as WorkRateKey[];

export const DEFAULT_WORK_RATES: WorkRates = {
  shift_day: 0,
  shift_money_unit: 1,
  pipeline_mount_m2: 0,
  equipment_mount_m2: 0,
  pipeline_demount_m2: 0,
  shift_foil_pm: 0
};

export function normalizeWorkRates(raw: unknown): WorkRates {
  const base = { ...DEFAULT_WORK_RATES };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const key of WORK_RATE_KEYS) {
    const n = Number(o[key]);
    if (Number.isFinite(n) && n >= 0) base[key] = n;
  }
  if (typeof o.updatedAt === "string") base.updatedAt = o.updatedAt;
  if (typeof o.updatedByUid === "string") base.updatedByUid = o.updatedByUid;
  return base;
}
