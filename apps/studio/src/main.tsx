import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { StudioApp } from "./app.tsx";
import { readBrowserEnvironment } from "./browser-environment.ts";
import { AppErrorBoundary } from "./error-boundary.tsx";
import "./styles/tokens.css";
import "./styles/studio.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Strongr Studio root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <StudioApp environment={readBrowserEnvironment(import.meta.env)} />
    </AppErrorBoundary>
  </StrictMode>,
);
