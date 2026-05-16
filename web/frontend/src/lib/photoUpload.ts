import { getApiToken } from "./apiClient";
import { buildApiUrl, isApiConfigured } from "./runtimeConfig";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_PHOTOS_PER_REPORT = 15;

let photoStorageRemote: boolean | null = null;

export type PhotoAddResult = {
  added: number;
  failed: number;
  skippedByLimit: number;
  totalSelected: number;
};

type DrawableSource = ImageBitmap | HTMLImageElement;

const IMAGE_EXT =
  /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif|tiff?|jfif|dng)$/i;

function fileName(file: File): string {
  return (file.name || "").toLowerCase();
}

function isHeicFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = fileName(file);
  return (
    mime.includes("heic") ||
    mime.includes("heif") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

function looksLikeImage(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (IMAGE_EXT.test(fileName(file))) return true;
  return !mime || mime === "application/octet-stream";
}

function sourceSize(source: DrawableSource): { w: number; h: number } {
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth || source.width, h: source.naturalHeight || source.height };
  }
  return { w: source.width, h: source.height };
}

async function heicToJpegBlob(file: File): Promise<Blob> {
  const mod = await import("heic2any");
  const heic2any = mod.default;
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!(blob instanceof Blob)) throw new Error("HEIC convert failed");
  return blob;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
    img.src = src;
  });
}

async function decodeBlobToSource(blob: Blob): Promise<DrawableSource> {
  try {
    return await createImageBitmap(blob);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      return await loadImageElement(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function decodeFileToSource(file: File): Promise<DrawableSource> {
  const errors: string[] = [];

  try {
    return await createImageBitmap(file);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "bitmap");
  }

  const url = URL.createObjectURL(file);
  try {
    return await loadImageElement(url);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "img");
  } finally {
    URL.revokeObjectURL(url);
  }

  if (isHeicFile(file)) {
    try {
      const jpegBlob = await heicToJpegBlob(file);
      return decodeBlobToSource(jpegBlob);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "heic");
    }
  }

  try {
    const jpegBlob = await heicToJpegBlob(file);
    return decodeBlobToSource(jpegBlob);
  } catch {
    /* not HEIC */
  }

  throw new Error(errors.join("; ") || "decode failed");
}

async function drawSourceToJpegBlob(
  source: DrawableSource,
  maxSide: number,
  quality: number
): Promise<Blob> {
  const { w: srcW, h: srcH } = sourceSize(source);
  if (!srcW || !srcH) throw new Error("Пустое изображение");

  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.drawImage(source, 0, 0, w, h);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось сжать фото"))),
      "image/jpeg",
      quality
    );
  });
}

async function fileToJpegBlob(file: File): Promise<Blob> {
  if (!looksLikeImage(file)) {
    throw new Error("Выбранный файл не является изображением");
  }

  const source = await decodeFileToSource(file);
  const attempts: Array<{ maxSide: number; quality: number }> = [
    { maxSide: 1600, quality: 0.85 },
    { maxSide: 1200, quality: 0.82 },
    { maxSide: 1024, quality: 0.78 },
    { maxSide: 800, quality: 0.72 }
  ];

  let last: Blob | null = null;
  try {
    for (const { maxSide, quality } of attempts) {
      const blob = await drawSourceToJpegBlob(source, maxSide, quality);
      last = blob;
      if (blob.size <= MAX_PHOTO_BYTES) return blob;
    }

    if (last && last.size <= MAX_PHOTO_BYTES * 1.05) return last;
    throw new Error("Фото слишком большое после сжатия (макс. 3 МБ).");
  } finally {
    if (source instanceof ImageBitmap) source.close();
  }
}

async function compressImage(file: File): Promise<Blob> {
  return fileToJpegBlob(file);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

/** JPEG data URL for form preview. */
export async function makePhotoPreview(file: File): Promise<string> {
  const blob = await compressImage(file);
  return blobToDataUrl(blob);
}

export async function preparePhotoItems(
  files: FileList | File[] | null,
  maxCount: number
): Promise<{ items: { file: File; preview: string }[]; result: PhotoAddResult }> {
  const arr = files ? Array.from(files) : [];
  const totalSelected = arr.length;
  const skippedByLimit = Math.max(0, totalSelected - maxCount);
  const toProcess = arr.slice(0, maxCount);
  const items: { file: File; preview: string }[] = [];
  let failed = 0;

  for (const file of toProcess) {
    if (!looksLikeImage(file)) {
      failed += 1;
      continue;
    }
    try {
      const preview = await makePhotoPreview(file);
      items.push({ file, preview });
    } catch {
      failed += 1;
    }
  }

  return {
    items,
    result: {
      added: items.length,
      failed,
      skippedByLimit,
      totalSelected
    }
  };
}

export function formatPhotoAddToast(
  result: PhotoAddResult
): { type: "success" | "error" | "warning"; message: string } | null {
  if (result.totalSelected === 0) return null;

  const { added, failed, skippedByLimit, totalSelected } = result;

  if (added === 0) {
    return {
      type: "error",
      message:
        "Не удалось открыть фото. Попробуйте другое изображение или снимок через «С камеры»."
    };
  }

  if (failed === 0 && skippedByLimit === 0) {
    return { type: "success", message: `Фото добавлено (${added})` };
  }

  const parts = [`Добавлено ${added} из ${totalSelected}`];
  if (failed > 0) {
    parts.push(`${failed} не открылись — попробуйте JPEG/PNG или «С камеры»`);
  }
  if (skippedByLimit > 0) {
    parts.push(`ещё ${skippedByLimit} не влезли (лимит на карточку)`);
  }

  return {
    type: failed > 0 ? "warning" : "success",
    message: parts.join(". ") + "."
  };
}

export function revokePhotoPreview(preview: string) {
  if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
}

export function resetPhotoStorageCache() {
  photoStorageRemote = null;
}

export async function isRemotePhotoStorageAvailable(): Promise<boolean> {
  if (!isApiConfigured) return false;
  if (photoStorageRemote != null) return photoStorageRemote;
  try {
    const res = await fetch(buildApiUrl("/api/health"));
    if (!res.ok) {
      photoStorageRemote = false;
      return false;
    }
    const data = (await res.json()) as { photoStorage?: string };
    photoStorageRemote = data.photoStorage === "ok";
    return photoStorageRemote;
  } catch {
    photoStorageRemote = false;
    return false;
  }
}

async function uploadOneToApi(file: File): Promise<string> {
  const blob = await compressImage(file);
  const body = new FormData();
  body.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));

  const token = getApiToken();
  const res = await fetch(buildApiUrl("/api/uploads"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body
  });
  const raw = await res.text();
  let data: { url?: string; error?: string } = {};
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    /* noop */
  }
  if (!res.ok) {
    throw new Error(data.error || `Ошибка загрузки фото (${res.status})`);
  }
  if (!data.url) throw new Error("Сервер не вернул URL фото");
  return data.url;
}

async function uploadOneLocal(file: File): Promise<string> {
  const blob = await compressImage(file);
  return blobToDataUrl(blob);
}

export async function uploadReportPhotos(
  _userId: string,
  _reportId: string,
  files: File[],
  _fallbackUrls: string[]
): Promise<string[]> {
  if (files.length > MAX_PHOTOS_PER_REPORT) {
    throw new Error(`Максимум ${MAX_PHOTOS_PER_REPORT} фото на отчёт.`);
  }

  const useRemote = await isRemotePhotoStorageAvailable();
  const out: string[] = [];

  for (let i = 0; i < files.length; i += 1) {
    try {
      let url: string;
      if (useRemote) {
        try {
          url = await uploadOneToApi(files[i]);
        } catch (apiErr) {
          resetPhotoStorageCache();
          url = await uploadOneLocal(files[i]);
          if (apiErr instanceof Error && apiErr.message) {
            console.warn("[ПТО] Облачная загрузка недоступна, фото в отчёте как base64:", apiErr.message);
          }
        }
      } else {
        url = await uploadOneLocal(files[i]);
      }
      out.push(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ошибка";
      throw new Error(`Фото ${i + 1}: ${msg}`);
    }
  }
  return out;
}
