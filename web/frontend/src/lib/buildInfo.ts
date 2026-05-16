/** Вшивается при `npm run build` (см. vite.config.ts). */
const buildLabel = import.meta.env.VITE_APP_BUILD_LABEL || "dev";
const buildCommit = import.meta.env.VITE_APP_BUILD_COMMIT || "";
const buildRun = import.meta.env.VITE_APP_BUILD_RUN || "";

export function getSiteBuildDisplay(): { line: string; detail: string } {
  const line = buildLabel;
  const parts: string[] = [];
  if (buildRun) parts.push(`сборка №${buildRun}`);
  if (buildCommit && buildCommit !== "local") parts.push(`коммит ${buildCommit}`);
  const detail =
    parts.length > 0
      ? `${parts.join(" · ")}. Сверьте с номером после публикации (ПТО — 3).`
      : "Локальная сборка. На сайте в интернете будет другой номер.";
  return { line, detail };
}
