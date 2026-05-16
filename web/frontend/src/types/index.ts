export type UserRole = "admin" | "isolator" | "director";
export type ItrSection =
  | "home"
  | "reports"
  | "timesheets"
  | "team"
  | "tasks"
  | "analytics"
  | "approvals"
  | "profile";

export type ShiftWorkType = "hours" | "money";

export interface ShiftWork {
  type: ShiftWorkType;
  value: number;
}

export interface Profile {
  uid: string;
  email: string;
  fullName: string;
  position?: string;
  brigadeNumber?: string;
  /** Может подавать отчёт за участников бригады */
  isBrigadeLeader?: boolean;
  phone?: string;
  telegram?: string;
  role: UserRole;
  allowedSections?: ItrSection[];
  createdAt?: string;
}

/** Участник работ на карточке трубы/оборудования */
export interface CrewMemberRef {
  uid: string;
  fullName: string;
  position?: string;
}

export type PipeWorkKind =
  | "pipeline_mount"
  | "equipment_mount"
  | "pipeline_demount"
  | "shift_foil";

export interface PipeEntry {
  id: string;
  siteName: string;
  diameter: number;
  insulationType: string;
  jointsCount: number;
  pipeLength: number;
  totalLength: number;
  comments: string;
  photoUrls: string[];
  /** Present in list API when photoUrls are stripped. */
  pipePhotoCount?: number;
  /** Изолировщики, выполнившие работу на этой карточке */
  crewMembers?: CrewMemberRef[];
  workKind?: PipeWorkKind;
}

export type ReportReviewStatus = "submitted" | "approved" | "needs_fix";

export interface ReportReview {
  byUid: string;
  byFullName: string;
  byPosition?: string;
  note?: string;
  decidedAt: string;
}

export interface Report {
  id?: string;
  date: string;
  fullName: string;
  brigadeNumber?: string;
  airTemperature: number;
  weather: string;
  userId: string;
  userEmail: string;
  /** Кто нажал «Отправить» (бригадир или сам изолировщик) */
  submittedByUid?: string;
  submittedByFullName?: string;
  /** Отчёт бригады: работа нескольких изолировщиков в одной смене */
  isBrigadeReport?: boolean;
  createdAt: number;
  pipes: PipeEntry[];
  shiftWork?: ShiftWork;
  shiftWorkDescription?: string;
  shiftWorkPhotoUrls?: string[];
  shiftWorkPipes?: string[];
  /** Photo count when shiftWorkPhotoUrls omitted in list API. */
  shiftPhotoCount?: number;
  photoCount?: number;
  hasPhotos?: boolean;

  status?: ReportReviewStatus;
  review?: ReportReview;

  // Legacy flat fields (kept optional for normalizing old data when reading).
  siteName?: string;
  diameter?: number;
  insulationType?: string;
  jointsCount?: number;
  pipeLength?: number;
  totalLength?: number;
  comments?: string;
  photoUrls?: string[];
}

export type TaskStatus = "open" | "done" | "cancelled";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeUid: string;
  assigneeFullName: string;
  assigneePosition?: string;
  createdByUid: string;
  createdByFullName: string;
  createdByPosition?: string;
  createdAt: string;
  updatedAt?: string;
  dueDate?: string;
  relatedReportId?: string;
  relatedReportLabel?: string;
}
