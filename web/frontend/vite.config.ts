import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Базовый путь сайта. Для user-pages (`<username>.github.io`) и кастомного домена — "/".
// Для project-pages подставится через переменную окружения, например "/PTO_Project/".
const basePath = process.env.VITE_BASE_PATH || "/";

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
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "ПТО Изоляция",
        short_name: "ПТО",
        description: "Контроль изоляции трубопроводов",
        theme_color: "#1e3a5f",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "firestore-cache"
            }
          }
        ]
      }
    })
  ]
});
