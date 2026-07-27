import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";

import type { BrowserEnvironmentState } from "./browser-environment.ts";
import { useStudioSession } from "./session-context.tsx";

interface StudioShellProps {
  readonly environment: BrowserEnvironmentState;
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "positive" | "warning";
}) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

export function StudioShell({ environment }: StudioShellProps) {
  const {
    activeOrganization,
    authentication,
    capabilities,
    clearNotice,
    identity,
    notice,
    selectOrganization,
    signOut,
  } = useStudioSession();
  const isSignedIn = authentication.status === "signed_in";
  const navigation = [
    { label: "Home", show: true, to: "/" },
    { label: "Work queue", show: Boolean(activeOrganization), to: "/work" },
    { label: "Security", show: isSignedIn, to: "/security" },
    { label: "Boundaries", show: true, to: "/boundaries" },
  ] as const;
  const enabledCapabilityCount =
    capabilities.status === "ready"
      ? Object.values(capabilities.value).filter(Boolean).length
      : null;

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="topbar">
        <div className="brand-lockup" aria-label="Strongr Studio" role="img">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>
            <strong>Strongr</strong>
            <small>Studio</small>
          </span>
        </div>

        <div className="topbar-status" aria-label="Studio status" role="status">
          <StatusPill tone={isSignedIn ? "positive" : "neutral"}>
            {isSignedIn ? "Signed in" : "Signed out"}
          </StatusPill>
          <span className="environment-state">
            {environment.status === "configured" ? "Preview configured" : "Local shell"}
          </span>
          {isSignedIn ? (
            <button className="text-button" onClick={() => void signOut()} type="button">
              Sign out
            </button>
          ) : (
            <NavLink className="text-link" to="/sign-in">
              Sign in
            </NavLink>
          )}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <nav aria-label="Primary">
            <ul>
              {navigation
                .filter(({ show }) => show)
                .map((item) => (
                  <li key={item.to}>
                    <NavLink
                      className={({ isActive }) => (isActive ? "nav-link is-active" : "nav-link")}
                      end={item.to === "/"}
                      to={item.to}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
            </ul>
          </nav>

          <section className="tenant-card" aria-labelledby="tenant-heading">
            <p className="eyebrow" id="tenant-heading">
              Active organization
            </p>
            {identity.status === "loading" ? <p role="status">Loading organizations…</p> : null}
            {identity.status === "error" ? <p role="alert">{identity.message}</p> : null}
            {identity.status === "ready" && identity.value.organizations.length > 0 ? (
              <>
                <label className="visually-hidden" htmlFor="active-organization">
                  Active organization
                </label>
                <select
                  id="active-organization"
                  onChange={(event) => selectOrganization(event.currentTarget.value)}
                  value={activeOrganization?.id ?? ""}
                >
                  {identity.value.organizations.length > 1 ? (
                    <option value="">Choose an organization</option>
                  ) : null}
                  {identity.value.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
                <strong>{activeOrganization?.name ?? "Choose an organization"}</strong>
                <p>
                  {enabledCapabilityCount === null
                    ? "Checking governed capabilities. The database remains authoritative."
                    : `${enabledCapabilityCount} of 12 governed capabilities available. Server checks remain authoritative.`}
                </p>
              </>
            ) : null}
            {identity.status === "ready" && identity.value.organizations.length === 0 ? (
              <>
                <strong>No active organization</strong>
                <p>No tenant context is inferred or available through current RLS.</p>
              </>
            ) : null}
            {identity.status === "idle" ? (
              <>
                <strong>Not selected</strong>
                <p>Sign in to discover only organizations allowed by current RLS.</p>
              </>
            ) : null}
          </section>
        </aside>

        <main className="main-content" id="main-content" tabIndex={-1}>
          {notice ? (
            <div className="session-notice" role="status">
              <p>{notice}</p>
              <button aria-label="Dismiss status message" onClick={clearNotice} type="button">
                ×
              </button>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
