import { BrowserRouter, Route, Routes } from "react-router-dom";

import type { BrowserEnvironmentState } from "./browser-environment.ts";
import { BoundariesPage, HomePage, NotFoundPage, WorkQueuePage } from "./pages.tsx";
import { StudioShell } from "./shell.tsx";

interface StudioAppProps {
  readonly environment: BrowserEnvironmentState;
}

export function StudioApp({ environment }: StudioAppProps) {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<StudioShell environment={environment} />}>
          <Route index element={<HomePage />} />
          <Route element={<WorkQueuePage />} path="work" />
          <Route element={<BoundariesPage />} path="boundaries" />
          <Route element={<NotFoundPage />} path="*" />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
