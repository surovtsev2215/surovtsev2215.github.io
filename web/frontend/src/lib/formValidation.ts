import type { PipeDraft } from "../hooks/usePipeList";

export type PipeCardSection = {
  sectionLabel: string;
  cardLabel: string;
  localId: string;
};

export function isValidWorkCard(p: PipeDraft): boolean {
  return (
    !!p.siteName.trim() &&
    !!p.insulationType &&
    (p.jointsCount ?? 0) > 0 &&
    (p.pipeLength ?? 0) > 0
  );
}

export function isValidDemountCard(p: PipeDraft): boolean {
  return !!p.siteName.trim() && (p.pipeLength ?? 0) > 0;
}

export function collectPhotoCardsWithoutValidData(
  sections: { pipes: PipeDraft[]; sectionLabel: string; isValid: (p: PipeDraft) => boolean; cardPrefix: string }[]
): PipeCardSection[] {
  const out: PipeCardSection[] = [];
  for (const { pipes, sectionLabel, isValid, cardPrefix } of sections) {
    pipes.forEach((p, idx) => {
      if (p.photos.length > 0 && !isValid(p)) {
        out.push({
          sectionLabel,
          cardLabel: `${cardPrefix} №${idx + 1}${p.siteName.trim() ? ` · ${p.siteName.trim()}` : ""}`,
          localId: p.localId
        });
      }
    });
  }
  return out;
}
