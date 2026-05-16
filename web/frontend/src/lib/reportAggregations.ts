import type { PipeEntry, Report } from "../types";

function makePipeFromLegacy(raw: Partial<Report>, fallbackId: string): PipeEntry {
  const jointsCount = typeof raw.jointsCount === "number" ? raw.jointsCount : 0;
  const pipeLength = typeof raw.pipeLength === "number" ? raw.pipeLength : 0;
  const totalLength =
    typeof raw.totalLength === "number"
      ? raw.totalLength
      : Number((jointsCount * pipeLength).toFixed(2));
  return {
    id: fallbackId,
    siteName: raw.siteName ?? "",
    diameter: typeof raw.diameter === "number" ? raw.diameter : 0,
    insulationType: raw.insulationType ?? "",
    jointsCount,
    pipeLength,
    totalLength,
    comments: raw.comments ?? "",
    photoUrls: Array.isArray(raw.photoUrls) ? raw.photoUrls : []
  };
}

export function normalizeReport(raw: Report | (Partial<Report> & Record<string, unknown>)): Report {
  const candidate = raw as Report;
  if (Array.isArray(candidate.pipes)) {
    return {
      ...candidate,
      pipes: candidate.pipes.map((p, i) => ({
        id: p.id ?? `pipe-${i}`,
        siteName: p.siteName ?? "",
        diameter: typeof p.diameter === "number" ? p.diameter : 0,
        insulationType: p.insulationType ?? "",
        jointsCount: typeof p.jointsCount === "number" ? p.jointsCount : 0,
        pipeLength: typeof p.pipeLength === "number" ? p.pipeLength : 0,
        totalLength:
          typeof p.totalLength === "number"
            ? p.totalLength
            : Number(((p.jointsCount ?? 0) * (p.pipeLength ?? 0)).toFixed(2)),
        comments: p.comments ?? "",
        photoUrls: Array.isArray(p.photoUrls) ? p.photoUrls : [],
        workKind: p.workKind
      }))
    };
  }
  const legacyId = `${candidate.id ?? candidate.createdAt ?? "legacy"}-pipe-0`;
  return {
    ...candidate,
    pipes: [makePipeFromLegacy(candidate, legacyId)]
  };
}

export function getReportTotalLength(r: Report): number {
  return r.pipes.reduce((sum, p) => sum + (p.totalLength || 0), 0);
}

export function getReportJointsCount(r: Report): number {
  return r.pipes.reduce((sum, p) => sum + (p.jointsCount || 0), 0);
}

export function getReportPipeCount(r: Report): number {
  return r.pipes.length;
}

export function getReportLineNames(r: Report): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of r.pipes) {
    const name = (p.siteName || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function formatLineNames(r: Report, max = 3): string {
  const names = getReportLineNames(r);
  if (!names.length) return "—";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} и ещё ${names.length - max}`;
}

export function matchesText(r: Report, needleRaw: string): boolean {
  const needle = needleRaw.trim().toLowerCase();
  if (!needle) return true;
  if (r.fullName?.toLowerCase().includes(needle)) return true;
  return r.pipes.some((p) =>
    p.siteName.toLowerCase().includes(needle) ||
    p.insulationType.toLowerCase().includes(needle)
  );
}
