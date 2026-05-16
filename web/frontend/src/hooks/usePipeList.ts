import { useRef, useState } from "react";
import { preparePhotoItems, revokePhotoPreview, type PhotoAddResult } from "../lib/photoUpload";
import type { CrewMemberRef } from "../types";

export interface PipeDraft {
  localId: string;
  siteName: string;
  diameter: number;
  insulationType: string;
  jointsCount: number;
  pipeLength?: number;
  comments: string;
  photos: { file: File; preview: string }[];
  /** Уже загруженные URL (режим редактирования отчёта). */
  keptPhotoUrls?: string[];
  crewMembers: CrewMemberRef[];
}

const emptyPhotoResult: PhotoAddResult = {
  added: 0,
  failed: 0,
  skippedByLimit: 0,
  totalSelected: 0
};

function makeEmptyPipe(defaultJointsCount: number): PipeDraft {
  return {
    localId: crypto.randomUUID(),
    siteName: "",
    diameter: 0,
    insulationType: "",
    jointsCount: defaultJointsCount,
    pipeLength: undefined,
    comments: "",
    photos: [],
    keptPhotoUrls: [],
    crewMembers: []
  };
}

export function usePipeList(options?: { defaultJointsCount?: number; maxPhotosPerPipe?: number }) {
  const defaultJointsCount = options?.defaultJointsCount ?? 1;
  const maxPhotosPerPipe = options?.maxPhotosPerPipe ?? 10;
  const [pipes, setPipes] = useState<PipeDraft[]>([]);
  const pipesRef = useRef(pipes);
  pipesRef.current = pipes;

  function updatePipe(localId: string, patch: Partial<PipeDraft>) {
    setPipes((prev) => prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p)));
  }

  function addPipe() {
    setPipes((prev) => [...prev, makeEmptyPipe(defaultJointsCount)]);
  }

  function removePipe(localId: string) {
    setPipes((prev) => {
      const removed = prev.find((p) => p.localId === localId);
      if (removed) removed.photos.forEach((ph) => revokePhotoPreview(ph.preview));
      return prev.filter((p) => p.localId !== localId);
    });
  }

  async function addPhotos(localId: string, files: FileList | null): Promise<PhotoAddResult> {
    if (!files?.length) return emptyPhotoResult;

    const pipe = pipesRef.current.find((p) => p.localId === localId);
    const kept = pipe?.keptPhotoUrls?.length ?? 0;
    const room = pipe ? Math.max(0, maxPhotosPerPipe - pipe.photos.length - kept) : 0;
    if (room <= 0) {
      return {
        added: 0,
        failed: 0,
        skippedByLimit: files.length,
        totalSelected: files.length
      };
    }

    const { items, result } = await preparePhotoItems(files, room);
    if (items.length > 0) {
      setPipes((prev) =>
        prev.map((p) => {
          if (p.localId !== localId) return p;
          return { ...p, photos: [...p.photos, ...items].slice(0, maxPhotosPerPipe) };
        })
      );
    }
    return result;
  }

  function removePhoto(localId: string, photoIdx: number) {
    setPipes((prev) =>
      prev.map((p) => {
        if (p.localId !== localId) return p;
        const next = [...p.photos];
        const removed = next.splice(photoIdx, 1)[0];
        if (removed) revokePhotoPreview(removed.preview);
        return { ...p, photos: next };
      })
    );
  }

  return { pipes, setPipes, updatePipe, addPipe, removePipe, addPhotos, removePhoto };
}
