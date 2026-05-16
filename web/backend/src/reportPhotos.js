import { createHash } from "crypto";

function isDataImageUrl(url) {
  return typeof url === "string" && url.startsWith("data:image/");
}

export function countReportPhotos(report) {
  let count = 0;
  if (Array.isArray(report.shiftWorkPhotoUrls)) count += report.shiftWorkPhotoUrls.length;
  if (Array.isArray(report.pipes)) {
    for (const pipe of report.pipes) {
      if (Array.isArray(pipe.photoUrls)) count += pipe.photoUrls.length;
    }
  }
  if (Array.isArray(report.photoUrls)) count += report.photoUrls.length;
  return count;
}

/** List view: drop heavy photo payloads, keep counts. */
export function stripReportPhotosForList(report) {
  const photoCount = countReportPhotos(report);
  const pipes = Array.isArray(report.pipes)
    ? report.pipes.map((pipe) => {
        const pipePhotoCount = Array.isArray(pipe.photoUrls) ? pipe.photoUrls.length : 0;
        const { photoUrls: _removed, ...rest } = pipe;
        return { ...rest, photoUrls: [], pipePhotoCount };
      })
    : [];

  const shiftPhotoCount = Array.isArray(report.shiftWorkPhotoUrls) ? report.shiftWorkPhotoUrls.length : 0;
  const { shiftWorkPhotoUrls: _shift, photoUrls: _legacy, ...rest } = report;
  return {
    ...rest,
    pipes,
    shiftWorkPhotoUrls: [],
    shiftPhotoCount,
    photoUrls: [],
    photoCount,
    hasPhotos: photoCount > 0
  };
}

export function findBase64PhotoInReport(report) {
  const check = (url, label) => {
    if (isDataImageUrl(url)) return label;
    return null;
  };

  if (Array.isArray(report.shiftWorkPhotoUrls)) {
    for (let i = 0; i < report.shiftWorkPhotoUrls.length; i += 1) {
      const hit = check(report.shiftWorkPhotoUrls[i], `фото смены ${i + 1}`);
      if (hit) return hit;
    }
  }
  if (Array.isArray(report.photoUrls)) {
    for (let i = 0; i < report.photoUrls.length; i += 1) {
      const hit = check(report.photoUrls[i], `фото ${i + 1}`);
      if (hit) return hit;
    }
  }
  if (Array.isArray(report.pipes)) {
    for (let p = 0; p < report.pipes.length; p += 1) {
      const pipe = report.pipes[p];
      if (!Array.isArray(pipe.photoUrls)) continue;
      for (let i = 0; i < pipe.photoUrls.length; i += 1) {
        const hit = check(pipe.photoUrls[i], `фото трубы ${p + 1}, №${i + 1}`);
        if (hit) return hit;
      }
    }
  }
  return null;
}

export function validateReportNoBase64Photos(report) {
  const where = findBase64PhotoInReport(report);
  if (where) {
    const err = new Error(
      `В отчёте нельзя сохранять встроенные фото (${where}). Настройте облачное хранилище (R2) и загрузите фото снова.`
    );
    err.code = "BASE64_PHOTO_REJECTED";
    throw err;
  }
}

export function reportsListEtag(reports) {
  const digest = createHash("sha1");
  for (const r of reports) {
    digest.update(String(r.id || ""));
    digest.update(String(r.createdAt || ""));
    digest.update(String(r.status || ""));
    digest.update(String(countReportPhotos(r)));
  }
  return `"${digest.digest("hex")}"`;
}
