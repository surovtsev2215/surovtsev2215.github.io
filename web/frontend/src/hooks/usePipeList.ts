import { useState } from "react";
import { makePhotoPreview, revokePhotoPreview } from "../lib/photoUpload";

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
      if (removed) removed.photos.forEach((ph) => revokePhotoPreview(ph.preview));
      return prev.filter((p) => p.localId !== localId);
    });
  }

  async function addPhotos(localId: string, files: FileList | null): Promise<number> {
    if (!files?.length) return 0;

    let room = 0;
    setPipes((prev) => {
      const pipe = prev.find((p) => p.localId === localId);
      room = pipe ? Math.max(0, maxPhotosPerPipe - pipe.photos.length) : 0;
      return prev;
    });
    if (room <= 0) return 0;

    const fileArr = Array.from(files).slice(0, room);
    const newItems: { file: File; preview: string }[] = [];
    for (const file of fileArr) {
      try {
        const preview = await makePhotoPreview(file);
        newItems.push({ file, preview });
      } catch {
        /* skip broken file */
      }
    }
    if (!newItems.length) return 0;

    setPipes((prev) =>
      prev.map((p) => {
        if (p.localId !== localId) return p;
        return { ...p, photos: [...p.photos, ...newItems].slice(0, maxPhotosPerPipe) };
      })
    );
    return newItems.length;
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
