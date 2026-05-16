import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function makeAppBuildMeta() {
  const d = new Date();
  const dateRu = `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  const commit = (process.env.GITHUB_SHA || "").slice(0, 7) || "local";
  const run = process.env.GITHUB_RUN_NUMBER || "";
  const label = run ? `№${run} · ${dateRu} UTC · ${commit}` : `${dateRu} UTC · ${commit}`;
  return { label, commit, run };
}

const appBuild = makeAppBuildMeta();

// Базовый путь сайта:
// - локально и для кастомного домена: "/"
// - для GitHub project pages: "/<repo>/"
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] || "";
const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const isUserPagesRepo = repoName.toLowerCase().endsWith(".github.io");
const autoGhPagesBase =
  isGithubActions && repoName ? (isUserPagesRepo ? "/" : `/${repoName}/`) : "/";
const basePath = process.env.VITE_BASE_PATH || autoGhPagesBase;

export default defineConfig({
  base: basePath,
  define: {
    "import.meta.env.VITE_APP_BUILD_LABEL": JSON.stringify(appBuild.label),
    "import.meta.env.VITE_APP_BUILD_COMMIT": JSON.stringify(appBuild.commit),
    "import.meta.env.VITE_APP_BUILD_RUN": JSON.stringify(appBuild.run)
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-router-dom")) {
              return "vendor-react";
            }
            if (id.includes("lucide-react") || id.includes("sonner")) {
              return "vendor-ui";
            }
          }
        }
      }
    }
  },
  plugins: [react()]
});
