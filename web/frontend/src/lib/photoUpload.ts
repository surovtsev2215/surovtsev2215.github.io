import { apiRequest } from "./apiClient";
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

type DrawableSource = ImageBitmap | HTMLImageElement | VideoFrame;

const IMAGE_EXT =
  /\.(jpe?g|png|gif|webp|bmp|avif|heic|heif|tiff?|jfif|dng|cr2|nef|arw)$/i;

const HEIC_MIME_RE = /heic|heif|hevc|avci|avcs/i;

function fileName(file: File): string {
  return (file.name || "").toLowerCase();
}

function guessMimeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".heic") || n.endsWith(".heif")) return "image/heic";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".bmp")) return "image/bmp";
  if (n.endsWith(".avif")) return "image/avif";
  if (/\.jpe?g$/.test(n) || n.endsWith(".jfif")) return "image/jpeg";
  if (/\.tiff?$/.test(n)) return "image/tiff";
  return "image/jpeg";
}

function isHeicFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  const name = fileName(file);
  return (
    HEIC_MIME_RE.test(mime) ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

function looksLikeImage(file: File): boolean {
  if (!file.size) return false;
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (HEIC_MIME_RE.test(mime)) return true;
  if (IMAGE_EXT.test(fileName(file))) return true;
  if (/^(video|audio)\//.test(mime)) return false;
  if (/^application\/(pdf|zip|msword)/.test(mime)) return false;
  return !mime || mime === "application/octet-stream";
}

function sourceSize(source: DrawableSource): { w: number; h: number } {
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth || source.width, h: source.naturalHeight || source.height };
  }
  if (source instanceof VideoFrame) {
    return {
      w: source.displayWidth || source.codedWidth,
      h: source.displayHeight || source.codedHeight
    };
  }
  return { w: source.width, h: source.height };
}

function closeSource(source: DrawableSource) {
  if (source instanceof ImageBitmap) source.close();
  if ("close" in source && typeof source.close === "function") {
    try {
      source.close();
    } catch {
      /* VideoFrame etc. */
    }
  }
}

async function heicToJpegBlob(file: File): Promise<Blob> {
  const mod = await import("heic2any");
  const heic2any = mod.default;
  const mime = file.type || guessMimeFromName(file.name);
  const input =
    file.type && file.type !== "application/octet-stream"
      ? file
      : new Blob([await file.arrayBuffer()], { type: mime });

  const qualities = [0.92, 0.85, 0.75];
  let lastErr: unknown;
  for (const quality of qualities) {
    try {
      const converted = await heic2any({
        blob: input,
        toType: "image/jpeg",
        quality
      });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      if (blob instanceof Blob && blob.size > 0) return blob;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("HEIC convert failed");
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (img.decode) {
        img.decode().then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

async function decodeWithImageDecoder(file: File): Promise<DrawableSource | null> {
  const ImageDecoderCtor = (globalThis as { ImageDecoder?: typeof ImageDecoder }).ImageDecoder;
  if (!ImageDecoderCtor) return null;
  try {
    const type = file.type || guessMimeFromName(file.name);
    const decoder = new ImageDecoderCtor({
      data: await file.arrayBuffer(),
      type
    });
    const { image } = await decoder.decode();
    return image;
  } catch {
    return null;
  }
}

async function decodeBlobToSource(blob: Blob): Promise<DrawableSource> {
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      return await loadImageElement(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function bitmapOptionsForFile(file: File): ImageBitmapOptions {
  const opts: ImageBitmapOptions = { imageOrientation: "from-image" };
  if (file.size > 12 * 1024 * 1024) opts.resizeWidth = 2048;
  else if (file.size > 5 * 1024 * 1024) opts.resizeWidth = 2560;
  return opts;
}

async function decodeFileToSource(file: File): Promise<DrawableSource> {
  const opts = bitmapOptionsForFile(file);

  try {
    return await createImageBitmap(file, opts);
  } catch {
    /* next */
  }

  const decoderSource = await decodeWithImageDecoder(file);
  if (decoderSource) return decoderSource;

  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImageElement(objectUrl);
  } catch {
    /* next */
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    return await loadImageElement(dataUrl);
  } catch {
    /* next */
  }

  if (isHeicFile(file)) {
    const jpegBlob = await heicToJpegBlob(file);
    return decodeBlobToSource(jpegBlob);
  }

  try {
    const jpegBlob = await heicToJpegBlob(file);
    return decodeBlobToSource(jpegBlob);
  } catch {
    /* not HEIC */
  }

  throw new Error("decode failed");
}

async function drawSourceToJpegBlob(
  source: DrawableSource,
  maxSide: number,
  quality: number
): Promise<Blob> {
  const { w: srcW, h: srcH } = sourceSize(source);
  if (!srcW || !srcH) throw new Error("Пустое изображение");

  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

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
    { maxSide: 1920, quality: 0.88 },
    { maxSide: 1600, quality: 0.85 },
    { maxSide: 1280, quality: 0.82 },
    { maxSide: 1024, quality: 0.78 },
    { maxSide: 800, quality: 0.72 },
    { maxSide: 640, quality: 0.65 },
    { maxSide: 512, quality: 0.55 }
  ];

  let last: Blob | null = null;
  try {
    for (const { maxSide, quality } of attempts) {
      const blob = await drawSourceToJpegBlob(source, maxSide, quality);
      last = blob;
      if (blob.size <= MAX_PHOTO_BYTES) return blob;
    }

    if (last && last.size <= MAX_PHOTO_BYTES * 1.1) return last;
    throw new Error("Фото слишком большое после сжатия (макс. 3 МБ).");
  } finally {
    closeSource(source);
  }
}

function jpegFileName(originalName: string, index: number): string {
  const base = (originalName || `photo-${index + 1}`).replace(/\.[^.]+$/, "");
  return `${base || "photo"}.jpg`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

/** JPEG data URL + normalized File for form preview and upload. */
export async function makePhotoItem(
  file: File,
  index: number
): Promise<{ file: File; preview: string }> {
  const blob = await fileToJpegBlob(file);
  const preview = await blobToDataUrl(blob);
  const jpegFile = new File([blob], jpegFileName(file.name, index), {
    type: "image/jpeg",
    lastModified: file.lastModified || Date.now()
  });
  return { file: jpegFile, preview };
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

  for (let i = 0; i < toProcess.length; i += 1) {
    const file = toProcess[i];
    if (!looksLikeImage(file)) {
      failed += 1;
      continue;
    }
    try {
      items.push(await makePhotoItem(file, i));
    } catch (err) {
      console.warn("[ПТО] Не удалось обработать фото:", file.name, err);
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

  if (added === 0 && skippedByLimit > 0 && failed === 0) {
    return {
      type: "warning",
      message: `Достигнут лимит фото (макс. ${totalSelected} за раз не влезли). Удалите старые или выберите меньше.`
    };
  }

  if (added === 0) {
    return {
      type: "error",
      message:
        "Не удалось открыть фото. Попробуйте по одному, JPEG/PNG, или снимок через «С камеры». HEIC с ПК иногда не поддерживается — сожмите в JPEG."
    };
  }

  if (failed === 0 && skippedByLimit === 0) {
    return { type: "success", message: `Фото добавлено (${added})` };
  }

  const parts = [`Добавлено ${added} из ${totalSelected}`];
  if (failed > 0) {
    parts.push(`${failed} не открылись — попробуйте JPEG или «С камеры»`);
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
  const blob =
    file.type === "image/jpeg" && file.size <= MAX_PHOTO_BYTES
      ? file
      : await fileToJpegBlob(file);
  const body = new FormData();
  body.append(
    "file",
    blob instanceof File ? blob : new File([blob], "photo.jpg", { type: "image/jpeg" })
  );

  const data = await apiRequest<{ url: string }>("/api/uploads", {
    method: "POST",
    body
  });
  if (!data.url) throw new Error("Сервер не вернул URL фото");
  return data.url;
}

async function uploadOneLocal(file: File): Promise<string> {
  if (file.type === "image/jpeg" && file.size <= MAX_PHOTO_BYTES) {
    return blobToDataUrl(file);
  }
  const blob = await fileToJpegBlob(file);
  return blobToDataUrl(blob);
}

export async function uploadReportPhotos(
  _userId: string,
  _reportId: string,
  files: File[],
  fallbackUrls: string[]
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
      const fallback = fallbackUrls[i];
      if (fallback?.startsWith("data:image/")) {
        out.push(fallback);
        console.warn("[ПТО] Фото сохранено из превью (облако недоступно):", i + 1);
        continue;
      }
      const msg = e instanceof Error ? e.message : "ошибка";
      throw new Error(`Фото ${i + 1}: ${msg}`);
    }
  }
  return out;
}

/** @deprecated use makePhotoItem */
export async function makePhotoPreview(file: File): Promise<string> {
  const { preview } = await makePhotoItem(file, 0);
  return preview;
}
