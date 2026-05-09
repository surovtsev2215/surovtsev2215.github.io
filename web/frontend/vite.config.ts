import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-router-dom")) {
              return "vendor-react";
            }
            if (id.includes("firebase/auth")) {
              return "vendor-firebase-auth";
            }
            if (
              id.includes("firebase/firestore") ||
              id.includes("firebase/storage") ||
              id.includes("@firebase/firestore") ||
              id.includes("@firebase/storage")
            ) {
              return "vendor-firebase-data";
            }
            if (id.includes("firebase/app") || id.includes("@firebase/app")) {
              return "vendor-firebase-core";
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
