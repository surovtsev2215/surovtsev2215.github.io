import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { isFirebaseConfigured, storage } from "./firebase";
import { isApiConfigured } from "./runtimeConfig";

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

export async function uploadReportPhotos(
  userId: string,
  reportId: string,
  files: File[],
  _fallbackUrls: string[]
) {
  if (isApiConfigured || !isFirebaseConfigured) {
    const out: string[] = [];
    for (const file of files) {
      const blob = await compressImage(file, 1024);
      out.push(await blobToDataUrl(blob));
    }
    return out;
  }

  if (files.length === 0) {
    return [];
  }

  const uploaded: string[] = [];
  for (let i = 0; i < files.length; i += 1) {
    const blob = await compressImage(files[i], 1024);
    const path = `reports/${userId}/${reportId}/${Date.now()}_${i}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
    uploaded.push(await getDownloadURL(storageRef));
  }
  return uploaded;
}
