export const POSITION_OPTIONS = [
  "Директор",
  "Начальник участка",
  "Руководитель проекта",
  "Инженер ПТО",
  "Инженер ПТО (Д)",
  "Производитель работ",
  "Мастер участка",
  "Маляр",
  "Изолировщик"
] as const;

export type PositionOption = (typeof POSITION_OPTIONS)[number];

export const ITR_POSITIONS: PositionOption[] = [
  "Директор",
  "Начальник участка",
  "Руководитель проекта",
  "Инженер ПТО",
  "Инженер ПТО (Д)",
  "Производитель работ",
  "Мастер участка"
];

export const FIELD_POSITIONS: PositionOption[] = ["Маляр", "Изолировщик"];

export function isItrPosition(value: string | undefined | null): boolean {
  if (!value) return false;
  return (ITR_POSITIONS as string[]).includes(value);
}

export function positionGroup(value: string | undefined | null):
  | "management"
  | "engineer"
  | "field-itr"
  | "worker"
  | "unknown" {
  if (!value) return "unknown";
  if (value === "Директор" || value === "Начальник участка" || value === "Руководитель проекта") return "management";
  if (value === "Инженер ПТО" || value === "Инженер ПТО (Д)") return "engineer";
  if (value === "Производитель работ" || value === "Мастер участка") return "field-itr";
  if (value === "Маляр" || value === "Изолировщик") return "worker";
  return "unknown";
}
