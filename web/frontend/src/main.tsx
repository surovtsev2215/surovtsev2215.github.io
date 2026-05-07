import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

if (typeof window !== "undefined") {
  // #region agent log
  window.addEventListener("error", (event) => {
    fetch("http://127.0.0.1:7653/ingest/20d63d97-1111-4b46-9651-c2ddf66cae7c", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cddc9f" },
      body: JSON.stringify({
        sessionId: "cddc9f",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "src/main.tsx:windowError",
        message: "global runtime error captured",
        data: { message: event.message ?? "unknown" },
        timestamp: Date.now()
      })
    }).catch(() => {});
  });
  // #endregion

  // #region agent log
  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      typeof event.reason === "string"
        ? event.reason
        : event.reason instanceof Error
          ? event.reason.message
          : "unknown";
    fetch("http://127.0.0.1:7653/ingest/20d63d97-1111-4b46-9651-c2ddf66cae7c", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "cddc9f" },
      body: JSON.stringify({
        sessionId: "cddc9f",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "src/main.tsx:unhandledRejection",
        message: "unhandled promise rejection captured",
        data: { reason },
        timestamp: Date.now()
      })
    }).catch(() => {});
  });
  // #endregion
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Force activation of the new service worker right away
    // so users do not stay on stale cached UI.
    updateSW(true);
  }
});

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
