import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";

import type { BrowserEnvironmentState } from "./browser-environment.ts";

interface StudioShellProps {
  readonly environment: BrowserEnvironmentState;
}

const navigation = [
  { label: "Home", to: "/" },
  { label: "Work queue", to: "/work" },
  { label: "Boundaries", to: "/boundaries" },
] as const;

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
          <StatusPill tone="positive">M3 foundation</StatusPill>
          <span className="environment-state">
            {environment.status === "configured" ? "Preview configured" : "Local shell"}
          </span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <nav aria-label="Primary">
            <ul>
              {navigation.map((item) => (
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
            <strong>Not selected</strong>
            <p>Tenant selection arrives in M3.1. The database remains authoritative.</p>
          </section>
        </aside>

        <main className="main-content" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
