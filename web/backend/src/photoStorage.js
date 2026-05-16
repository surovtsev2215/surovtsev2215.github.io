import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import sharp from "sharp";

function requiredEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : "";
}

export function isPhotoStorageConfigured() {
  return Boolean(
    requiredEnv("S3_ENDPOINT") &&
      requiredEnv("S3_BUCKET") &&
      requiredEnv("S3_ACCESS_KEY_ID") &&
      requiredEnv("S3_SECRET_ACCESS_KEY") &&
      requiredEnv("S3_PUBLIC_BASE_URL")
  );
}

let client;

function getClient() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: requiredEnv("S3_ENDPOINT"),
      credentials: {
        accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY")
      }
    });
  }
  return client;
}

async function putObject(key, body, contentType) {
  const bucket = requiredEnv("S3_BUCKET");
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000"
    })
  );
  const base = requiredEnv("S3_PUBLIC_BASE_URL").replace(/\/$/, "");
  return `${base}/${key}`;
}

async function normalizeJpegBuffers(buffer, mimeType) {
  const input = sharp(buffer, { failOn: "none" });
  const main = await input
    .clone()
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const thumb = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(400, 400, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
  return { main, thumb, contentType: "image/jpeg" };
}

/** @returns {{ url: string, thumbUrl: string }} */
export async function uploadPhotoBuffer(userId, buffer, mimeType) {
  if (!isPhotoStorageConfigured()) {
    const err = new Error("PHOTO_STORAGE_DISABLED");
    err.code = "PHOTO_STORAGE_DISABLED";
    throw err;
  }

  const { main, thumb } = await normalizeJpegBuffers(buffer, mimeType);
  const day = new Date().toISOString().slice(0, 10);
  const id = randomUUID();
  const key = `reports/${userId}/${day}/${id}.jpg`;
  const thumbKey = `reports/${userId}/${day}/${id}-thumb.jpg`;

  const url = await putObject(key, main, "image/jpeg");
  const thumbUrl = await putObject(thumbKey, thumb, "image/jpeg");
  return { url, thumbUrl };
}
