import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import "./overrides.css";

// Ensure stale PWA service worker caches are immediately refreshed
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const r of registrations) {
      r.update();
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
