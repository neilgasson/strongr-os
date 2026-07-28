import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import type { BrowserEnvironmentState } from "./browser-environment.ts";
import { ContentWorkspacePage } from "./content-workspace-page.tsx";
import {
  BoundariesPage,
  HomePage,
  NotFoundPage,
  SecurityPage,
  SignInPage,
  WorkQueuePage,
} from "./pages.tsx";
import { StudioSessionProvider, useStudioSession } from "./session-context.tsx";
import { StudioShell } from "./shell.tsx";

interface StudioAppProps {
  readonly environment: BrowserEnvironmentState;
}

export function StudioApp({ environment }: StudioAppProps) {
  return (
    <StudioSessionProvider environment={environment}>
      <BrowserRouter>
        <Routes>
          <Route element={<StudioShell environment={environment} />}>
            <Route index element={<HomePage />} />
            <Route element={<SignInPage />} path="sign-in" />
            <Route
              element={
                <RequireSignedIn>
                  <SecurityPage />
                </RequireSignedIn>
              }
              path="security"
            />
            <Route
              element={
                <RequireOrganization>
                  <WorkQueuePage />
                </RequireOrganization>
              }
              path="work"
            />
            <Route
              element={
                <RequireOrganization>
                  <ContentWorkspacePage />
                </RequireOrganization>
              }
              path="content"
            />
            <Route element={<BoundariesPage />} path="boundaries" />
            <Route element={<NotFoundPage />} path="*" />
          </Route>
        </Routes>
      </BrowserRouter>
    </StudioSessionProvider>
  );
}

function RequireSignedIn({ children }: { readonly children: React.ReactNode }) {
  const { authentication } = useStudioSession();
  const location = useLocation();
  if (authentication.status === "initializing") {
    return <p role="status">Restoring the local Studio session…</p>;
  }
  if (authentication.status !== "signed_in") {
    return <Navigate replace state={{ from: location.pathname }} to="/sign-in" />;
  }
  return children;
}

function RequireOrganization({ children }: { readonly children: React.ReactNode }) {
  const { activeOrganization, authentication } = useStudioSession();
  if (authentication.status !== "signed_in") {
    return <RequireSignedIn>{children}</RequireSignedIn>;
  }
  if (!activeOrganization) {
    return <Navigate replace to="/" />;
  }
  return <RequireSignedIn>{children}</RequireSignedIn>;
}
