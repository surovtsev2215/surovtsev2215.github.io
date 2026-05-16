import { useId, useRef } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

export type PhotoDraft = { file: File; preview: string };

type PhotoAttachFieldProps = {
  id: string;
  label: string;
  hint?: string;
  maxPhotos: number;
  photos: PhotoDraft[];
  onAdd: (files: FileList | null) => void | Promise<void>;
  onRemove: (index: number) => void;
};

export function PhotoAttachField({
  id,
  label,
  hint = "Фото сохранятся только если карточка заполнена полностью.",
  maxPhotos,
  photos,
  onAdd,
  onRemove
}: PhotoAttachFieldProps) {
  const cameraInputId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    await onAdd(files);
  }

  return (
    <div className="surface-muted soft-ring border border-dashed border-slate-300 p-3 theme-dark:border-slate-600">
      <Label htmlFor={id} className="mb-2 block">
        <span className="inline-flex items-center gap-1">
          <ImagePlus className="h-4 w-4" aria-hidden />
          {label} ({photos.length}/{maxPhotos})
        </span>
      </Label>
      <p className="mb-2 text-xs text-slate-500 theme-dark:text-slate-400">{hint}</p>
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          type="file"
          accept="image/*"
          multiple
          className="min-w-0 flex-1 cursor-pointer border-dashed py-2"
          disabled={photos.length >= maxPhotos}
          onChange={async (e) => {
            await handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-12 shrink-0"
          disabled={photos.length >= maxPhotos}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="mr-1 h-4 w-4" aria-hidden />
          С камеры
        </Button>
        <input
          ref={cameraRef}
          id={cameraInputId}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={async (e) => {
            await handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {!!photos.length && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((ph, photoIdx) => (
            <div key={`${ph.preview.slice(0, 32)}-${photoIdx}`} className="relative">
              <img
                src={ph.preview}
                alt={`Фото ${photoIdx + 1}`}
                loading="lazy"
                decoding="async"
                className="h-24 w-full rounded-lg object-cover"
              />
              <button
                type="button"
                className="absolute right-1 top-1 rounded bg-black/60 px-2 py-1 text-xs text-white"
                onClick={() => onRemove(photoIdx)}
                aria-label="Удалить фото"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
