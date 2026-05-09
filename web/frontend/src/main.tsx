import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const CHUNK_RELOAD_KEY = "pto-chunk-reload-once";

function tryRecoverFromChunkLoadError(message: string) {
  const isChunkError =
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Loading chunk") ||
    message.includes("Importing a module script failed");
  if (!isChunkError) return;
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("_r", Date.now().toString());
  window.location.replace(nextUrl.toString());
}

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  // Remove any previously installed SW to prevent stale UI after deploys.
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => {
      // Ignore unregister errors to avoid blocking app startup.
    });
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    tryRecoverFromChunkLoadError(String(event.message || ""));
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || "");
    tryRecoverFromChunkLoadError(message);
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
