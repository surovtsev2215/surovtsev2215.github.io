export type UserRole = "admin" | "isolator" | "director";

export type ShiftWorkType = "hours" | "money";

export interface ShiftWork {
  type: ShiftWorkType;
  value: number;
}

export interface Profile {
  uid: string;
  email: string;
  fullName: string;
  brigadeNumber?: string;
  role: UserRole;
  createdAt?: string;
}

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
  createdAt: number;
  pipes: PipeEntry[];
  shiftWork?: ShiftWork;
  shiftWorkDescription?: string;
  shiftWorkPhotoUrls?: string[];
  shiftWorkPipes?: string[];

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
