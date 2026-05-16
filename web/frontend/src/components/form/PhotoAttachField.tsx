import { useId, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

export type PhotoDraft = { file: File; preview: string };

const FILE_ACCEPT =
  "image/*,.heic,.heif,.jpg,.jpeg,.png,.gif,.webp,.bmp,.avif,.tif,.tiff";

type PhotoAttachFieldProps = {
  id: string;
  label: string;
  hint?: string;
  maxPhotos: number;
  photos: PhotoDraft[];
  existingUrls?: string[];
  onAdd: (files: FileList | null) => void | Promise<void>;
  onRemove: (index: number) => void;
  onRemoveExisting?: (index: number) => void;
};

export function PhotoAttachField({
  id,
  label,
  hint = "JPEG, PNG, HEIC, WebP и др. Если много фото — добавляйте по 2–3 за раз. Сохраняются при полностью заполненной карточке.",
  maxPhotos,
  photos,
  existingUrls = [],
  onAdd,
  onRemove,
  onRemoveExisting
}: PhotoAttachFieldProps) {
  const cameraInputId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length || processing) return;
    setProcessing(true);
    try {
      await onAdd(files);
    } finally {
      setProcessing(false);
    }
  }

  const totalCount = photos.length + existingUrls.length;
  const atLimit = totalCount >= maxPhotos;

  return (
    <div className="surface-muted soft-ring border border-dashed border-slate-300 p-3 theme-dark:border-slate-600">
      <Label htmlFor={id} className="mb-2 block">
        <span className="inline-flex items-center gap-1">
          {processing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ImagePlus className="h-4 w-4" aria-hidden />
          )}
          {label} ({totalCount}/{maxPhotos})
        </span>
      </Label>
      <p className="mb-2 text-xs text-slate-500 theme-dark:text-slate-400">{hint}</p>
      {processing && (
        <p className="mb-2 text-xs text-primary">Обработка фото, подождите…</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          type="file"
          accept={FILE_ACCEPT}
          multiple
          className="min-w-0 flex-1 cursor-pointer border-dashed py-2"
          disabled={atLimit || processing}
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
          disabled={atLimit || processing}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="mr-1 h-4 w-4" aria-hidden />
          С камеры
        </Button>
        <input
          ref={cameraRef}
          id={cameraInputId}
          type="file"
          accept={FILE_ACCEPT}
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          disabled={atLimit || processing}
          onChange={async (e) => {
            await handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {!!(photos.length || existingUrls.length) && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {existingUrls.map((url, photoIdx) => (
            <div key={`${url}-${photoIdx}`} className="relative">
              <img
                src={url}
                alt={`Сохранённое фото ${photoIdx + 1}`}
                loading="lazy"
                decoding="async"
                className="h-24 w-full rounded-lg object-cover"
              />
              {onRemoveExisting ? (
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded bg-black/60 px-2 py-1 text-xs text-white"
                  onClick={() => onRemoveExisting(photoIdx)}
                  aria-label="Удалить фото"
                  disabled={processing}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
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
                disabled={processing}
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
