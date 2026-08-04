import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ContentReviewPage } from "./content-review-page.tsx";
import "./styles/tokens.css";
import "./styles/studio.css";

const root = document.getElementById("root");
if (!root) throw new Error("Development review root is missing");

createRoot(root).render(
  <StrictMode>
    <main className="main-content">
      <ContentReviewPage developmentPreview />
    </main>
  </StrictMode>,
);
