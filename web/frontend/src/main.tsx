import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  // Remove any previously installed SW to prevent stale UI after deploys.
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => {
      // Ignore unregister errors to avoid blocking app startup.
    });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
