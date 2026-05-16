import type { PipeDraft } from "../hooks/usePipeList";
import type { CrewMemberRef, PipeEntry, Profile, Report } from "../types";
import { formatFullNameForDisplay } from "./normalizeFullName";

export function isBrigadeLeader(profile?: Profile | null): boolean {
  if (!profile) return false;
  if (profile.isBrigadeLeader) return true;
  return /бригадир/i.test(profile.position || "");
}

export function crewMembersFromDraft(p: PipeDraft): CrewMemberRef[] {
  return (p.crewMembers ?? []).map((m: CrewMemberRef) => ({
    uid: m.uid,
    fullName: formatFullNameForDisplay(m.fullName),
    position: m.position?.trim() || undefined
  }));
}

export function formatCrewLine(members?: CrewMemberRef[]): string {
  if (!members?.length) return "";
  return members.map((m) => formatFullNameForDisplay(m.fullName)).join(", ");
}

export function pipeEntryFromDraft(p: PipeDraft, base: Omit<PipeEntry, "crewMembers">): PipeEntry {
  const crewMembers = crewMembersFromDraft(p);
  return crewMembers.length ? { ...base, crewMembers } : base;
}

export function collectUniqueCrewFromReport(report: Report): CrewMemberRef[] {
  const byUid = new Map<string, CrewMemberRef>();
  for (const pipe of report.pipes) {
    for (const m of pipe.crewMembers ?? []) {
      if (!m.uid || byUid.has(m.uid)) continue;
      byUid.set(m.uid, {
        uid: m.uid,
        fullName: formatFullNameForDisplay(m.fullName),
        position: m.position?.trim() || undefined
      });
    }
  }
  return Array.from(byUid.values());
}
