import { useState } from "react";

export interface PipeDraft {
  localId: string;
  siteName: string;
  diameter: number;
  insulationType: string;
  jointsCount: number;
  pipeLength?: number;
  comments: string;
  photos: { file: File; preview: string }[];
}

function makeEmptyPipe(defaultJointsCount: number): PipeDraft {
  return {
    localId: crypto.randomUUID(),
    siteName: "",
    diameter: 0,
    insulationType: "",
    jointsCount: defaultJointsCount,
    pipeLength: undefined,
    comments: "",
    photos: []
  };
}

export function usePipeList(options?: { defaultJointsCount?: number; maxPhotosPerPipe?: number }) {
  const defaultJointsCount = options?.defaultJointsCount ?? 1;
  const maxPhotosPerPipe = options?.maxPhotosPerPipe ?? 10;
  const [pipes, setPipes] = useState<PipeDraft[]>([]);

  function updatePipe(localId: string, patch: Partial<PipeDraft>) {
    setPipes((prev) => prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p)));
  }

  function addPipe() {
    setPipes((prev) => [...prev, makeEmptyPipe(defaultJointsCount)]);
  }

  function removePipe(localId: string) {
    setPipes((prev) => {
      const removed = prev.find((p) => p.localId === localId);
      if (removed) removed.photos.forEach((ph) => URL.revokeObjectURL(ph.preview));
      return prev.filter((p) => p.localId !== localId);
    });
  }

  function addPhotos(localId: string, files: FileList | null) {
    if (!files) return;
    setPipes((prev) =>
      prev.map((p) => {
        if (p.localId !== localId) return p;
        const room = Math.max(0, maxPhotosPerPipe - p.photos.length);
        const next = Array.from(files)
          .slice(0, room)
          .map((file) => ({ file, preview: URL.createObjectURL(file) }));
        return { ...p, photos: [...p.photos, ...next].slice(0, maxPhotosPerPipe) };
      })
    );
  }

  function removePhoto(localId: string, photoIdx: number) {
    setPipes((prev) =>
      prev.map((p) => {
        if (p.localId !== localId) return p;
        const next = [...p.photos];
        const removed = next.splice(photoIdx, 1)[0];
        if (removed) URL.revokeObjectURL(removed.preview);
        return { ...p, photos: next };
      })
    );
  }

  return { pipes, setPipes, updatePipe, addPipe, removePipe, addPhotos, removePhoto };
}
