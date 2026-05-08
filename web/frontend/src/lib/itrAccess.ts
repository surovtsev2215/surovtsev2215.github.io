import {
  ClipboardList,
  Home,
  ListChecks,
  ListFilter,
  PieChart,
  ShieldCheck,
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
  | "directorHome"
  | "directorReports"
  | "directorTeam"
  | "directorTasks"
  | "directorAnalytics"
  | "directorApprovals"
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
    label: "Главная",
    to: "/director",
    icon: Home,
    preload: "directorHome",
    description: "Дашборд под вашу должность с ключевыми показателями и быстрыми действиями."
  },
  reports: {
    id: "reports",
    label: "Отчёты",
    to: "/director?section=reports",
    icon: ListFilter,
    preload: "directorReports",
    description: "Поиск, фильтрация и переход в карточку отчёта."
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
    label: "Аналитика",
    to: "/director?section=analytics",
    icon: PieChart,
    preload: "directorAnalytics",
    description: "Динамика по дням, топ исполнителей, распределение по типам изоляции."
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
  "home",
  "reports",
  "team",
  "tasks",
  "analytics",
  "approvals",
  "profile"
];

export function getItrSections(position?: string | null, allowedSections?: ItrSection[] | null): ItrSection[] {
  void position;
  if (Array.isArray(allowedSections) && allowedSections.length > 0) {
    const unique = Array.from(new Set(allowedSections)).filter((section): section is ItrSection =>
      ALL_ITR_SECTIONS.includes(section)
    );
    if (!unique.includes("home")) unique.unshift("home");
    if (!unique.includes("profile")) unique.push("profile");
    return unique;
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
  return getItrSections(position).includes(section);
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
    hasSection: (section) => sections.includes(section),
    isManagement: preset === "management",
    isEngineer: preset === "engineer",
    isField: preset === "field"
  };
}
