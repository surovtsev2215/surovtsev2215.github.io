import {
  ClipboardList,
  ListFilter,
  ShieldCheck,
  Table2,
  UserRound,
  Users,
  type LucideIcon
} from "lucide-react";
import { positionGroup } from "./positions";
import type { ItrSection as ItrSectionType } from "../types";

export type ItrSection = ItrSectionType;

export type ItrPreset = "management" | "engineer" | "field" | "default";

export type ItrPreloadKey =
  | "directorWorkspace"
  | "directorReports"
  | "directorTeam"
  | "directorTasks"
  | "directorApprovals"
  | "directorTimesheets"
  | "directorProfile";

export interface ItrSectionMeta {
  id: ItrSection;
  label: string;
  to: string;
  icon: LucideIcon;
  preload: ItrPreloadKey;
  description: string;
}

export const itrSectionMeta: Record<ItrSection, ItrSectionMeta> = {
  home: {
    id: "home",
    label: "Отчёты",
    to: "/director?section=reports",
    icon: ListFilter,
    preload: "directorReports",
    description: "Перенаправление на раздел отчётов."
  },
  reports: {
    id: "reports",
    label: "Отчёты",
    to: "/director?section=reports",
    icon: ListFilter,
    preload: "directorReports",
    description: "Поиск, фильтрация и переход в карточку отчёта."
  },
  timesheets: {
    id: "timesheets",
    label: "Табеля",
    to: "/director?section=timesheets",
    icon: Table2,
    preload: "directorTimesheets",
    description: "Табеля изолировщиков по согласованным отчётам и расценкам работ."
  },
  team: {
    id: "team",
    label: "Команда",
    to: "/director?section=team",
    icon: Users,
    preload: "directorTeam",
    description: "Сотрудники по должностям, выработка за период, переход в их отчёты."
  },
  tasks: {
    id: "tasks",
    label: "Задачи",
    to: "/director?section=tasks",
    icon: ClipboardList,
    preload: "directorTasks",
    description: "Постановка задач коллегам и контроль исполнения."
  },
  analytics: {
    id: "analytics",
    label: "Отчёты",
    to: "/director?section=reports",
    icon: ListFilter,
    preload: "directorReports",
    description: "Перенаправление на раздел отчётов."
  },
  approvals: {
    id: "approvals",
    label: "Согласование",
    to: "/director?section=approvals",
    icon: ShieldCheck,
    preload: "directorApprovals",
    description: "Отчёты на согласование, утверждение и возврат на доработку."
  },
  profile: {
    id: "profile",
    label: "Профиль",
    to: "/director?section=profile",
    icon: UserRound,
    preload: "directorProfile",
    description: "Ваши данные и список доступных разделов."
  }
};

export const ALL_ITR_SECTIONS: ItrSection[] = [
  "reports",
  "timesheets",
  "approvals",
  "team",
  "tasks",
  "profile"
];

export function getItrSections(position?: string | null, allowedSections?: ItrSection[] | null): ItrSection[] {
  void position;
  if (Array.isArray(allowedSections) && allowedSections.length > 0) {
    const unique = Array.from(
      new Set(
        allowedSections.map((section) =>
          section === "home" || section === "analytics" ? "reports" : section
        )
      )
    ).filter((section) => ALL_ITR_SECTIONS.includes(section as (typeof ALL_ITR_SECTIONS)[number])) as ItrSection[];
    const normalized = Array.from(new Set(unique));
    if (!normalized.includes("reports")) normalized.unshift("reports");
    if (!normalized.includes("profile")) normalized.push("profile");
    return normalized;
  }
  return ALL_ITR_SECTIONS;
}

export function getItrPreset(position?: string | null): ItrPreset {
  switch (positionGroup(position)) {
    case "management":
      return "management";
    case "engineer":
      return "engineer";
    case "field-itr":
      return "field";
    default:
      return "default";
  }
}

export function presetTitle(preset: ItrPreset): string {
  if (preset === "management") return "Командный режим";
  if (preset === "engineer") return "Инженерный режим";
  if (preset === "field") return "Полевой режим";
  return "Базовый режим";
}

export function hasSection(position: string | null | undefined, section: ItrSection): boolean {
  return getItrSections(position).includes(section === "home" || section === "analytics" ? "reports" : section);
}

export interface ItrAccess {
  position: string;
  sections: ItrSection[];
  preset: ItrPreset;
  presetTitle: string;
  hasSection: (section: ItrSection) => boolean;
  isManagement: boolean;
  isEngineer: boolean;
  isField: boolean;
}

export function buildItrAccess(
  position: string | null | undefined,
  allowedSections?: ItrSection[] | null
): ItrAccess {
  const sections = getItrSections(position, allowedSections);
  const preset = getItrPreset(position);
  return {
    position: position ?? "",
    sections,
    preset,
    presetTitle: presetTitle(preset),
    hasSection: (section) => sections.includes(section === "home" || section === "analytics" ? "reports" : section),
    isManagement: preset === "management",
    isEngineer: preset === "engineer",
    isField: preset === "field"
  };
}
