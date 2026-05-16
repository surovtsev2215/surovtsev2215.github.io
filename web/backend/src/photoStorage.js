import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

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

export async function uploadPhotoBuffer(userId, buffer, mimeType) {
  if (!isPhotoStorageConfigured()) {
    const err = new Error("PHOTO_STORAGE_DISABLED");
    err.code = "PHOTO_STORAGE_DISABLED";
    throw err;
  }

  const ext = mimeType === "image/png" ? "png" : "jpg";
  const key = `reports/${userId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  const bucket = requiredEnv("S3_BUCKET");

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000"
    })
  );

  const base = requiredEnv("S3_PUBLIC_BASE_URL").replace(/\/$/, "");
  return `${base}/${key}`;
}
