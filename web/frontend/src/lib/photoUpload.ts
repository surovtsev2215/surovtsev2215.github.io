import { getApiToken } from "./apiClient";
import { buildApiUrl, isApiConfigured } from "./runtimeConfig";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_PHOTOS_PER_REPORT = 15;

let photoStorageRemote: boolean | null = null;

async function compressImage(file: File, maxSide = 1024): Promise<Blob> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const w = Math.round(image.width * scale);
  const h = Math.round(image.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(image, 0, 0, w, h);

  return await new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.82);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

/** JPEG data URL for form preview (HEIC and other formats supported via canvas). */
export async function makePhotoPreview(file: File): Promise<string> {
  const blob = await compressImage(file, 1024);
  return blobToDataUrl(blob);
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
  const blob = await compressImage(file, 1024);
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error("Фото слишком большое после сжатия (макс. 3 МБ).");
  }
  const body = new FormData();
  body.append("file", new File([blob], file.name || "photo.jpg", { type: "image/jpeg" }));

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
  const blob = await compressImage(file, 1024);
  if (blob.size > MAX_PHOTO_BYTES) {
    throw new Error("Фото слишком большое (макс. 3 МБ).");
  }
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
