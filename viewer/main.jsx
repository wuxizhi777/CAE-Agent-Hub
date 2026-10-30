import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CaeAgentWorkspace from "./components/CaeAgentWorkspace";
import faviconUrl from "./app/favicon.png";
import "./app/globals.css";
import "./app/agent.css";

const ROOT_ID = "root";

function ensureFavicon() {
  if (typeof document === "undefined") {
    return;
  }

  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  icon.type = "image/png";
  icon.href = faviconUrl;
}

function bootstrap() {
  const rootElement = document.getElementById(ROOT_ID);
  if (!rootElement) {
    throw new Error(`Missing #${ROOT_ID} mount point.`);
  }
  ensureFavicon();
  document.title = "CAE Agent Hub — CalculiX";
  const root = window.__textToCaeRoot || createRoot(rootElement);
  window.__textToCaeRoot = root;
  root.render(
    <StrictMode>
      <CaeAgentWorkspace />
    </StrictMode>,
  );
}

bootstrap();
