import { Link } from "react-router-dom";

const workflowStages = [
  ["01", "Brief", "Define a synthetic audio-reflection brief."],
  ["02", "Draft", "Generate and inspect an immutable version."],
  ["03", "Evidence", "Keep automated checks separate from human authority."],
  ["04", "Approve", "Bind AAL2 approval to the exact evidence snapshot."],
  ["05", "Stage", "Verify private media, stage, and revoke without publishing."],
] as const;

const queueLanes = [
  ["Briefs", "No active briefs"],
  ["Generation", "No queued jobs"],
  ["Human review", "No decisions waiting"],
  ["Media", "No private artifacts waiting"],
] as const;

export function HomePage() {
  return (
    <>
      <section className="hero" aria-labelledby="home-heading">
        <div>
          <p className="eyebrow">Operator console foundation</p>
          <h1 id="home-heading">Governed work, clearly in view.</h1>
          <p className="hero-copy">
            Strongr Studio is the human interface to the accepted Strongr OS workflow. M3.0
            establishes the shell only; sign-in and real tenant work begin in M3.1.
          </p>
        </div>
        <div className="hero-state" aria-label="Current access state" role="status">
          <span className="state-dot" aria-hidden="true" />
          <div>
            <strong>Not signed in</strong>
            <span>No privileged operation is available.</span>
          </div>
        </div>
      </section>

      <section className="notice" aria-labelledby="foundation-notice">
        <span className="notice-icon" aria-hidden="true">
          i
        </span>
        <div>
          <h2 id="foundation-notice">This is a non-production foundation</h2>
          <p>
            It contains no production credentials, publication path, public media, live provider, or
            Strongr Daily integration.
          </p>
        </div>
      </section>

      <section aria-labelledby="flow-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Primary path</p>
            <h2 id="flow-heading">From idea to private staging</h2>
          </div>
          <Link className="text-link" to="/boundaries">
            Review boundaries
          </Link>
        </div>

        <ol className="workflow-grid">
          {workflowStages.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export function WorkQueuePage() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Work queue</p>
        <h1>One place for the complete governed flow.</h1>
        <p>
          Canonical tenant reads and resumable states connect here in M3.1. Empty states are
          explicit so absence is never mistaken for success.
        </p>
      </div>

      <section className="queue-grid" aria-label="Work queue lanes">
        {queueLanes.map(([title, emptyState]) => (
          <article key={title}>
            <div className="queue-card-heading">
              <h2>{title}</h2>
              <span>
                <span className="visually-hidden">Zero items</span>0
              </span>
            </div>
            <p>{emptyState}</p>
            <small>Available after authenticated organization selection.</small>
          </article>
        ))}
      </section>
    </>
  );
}

export function BoundariesPage() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Trust boundaries</p>
        <h1>The browser guides. The database decides.</h1>
        <p>
          Studio never treats a visible button, route, cached assurance level, or browser state as
          authorization.
        </p>
      </div>

      <section className="boundary-list" aria-label="Strongr Studio security boundaries">
        <article>
          <span aria-hidden="true">01</span>
          <div>
            <h2>Public browser configuration only</h2>
            <p>
              The bundle accepts the isolated Supabase URL and publishable key. Privileged
              credentials remain worker and CI only.
            </p>
          </div>
        </article>
        <article>
          <span aria-hidden="true">02</span>
          <div>
            <h2>Narrow governed commands</h2>
            <p>
              Reads remain tenant-filtered. Changes travel through reviewed RPCs that recheck
              membership, permissions, exact identity, and assurance.
            </p>
          </div>
        </article>
        <article>
          <span aria-hidden="true">03</span>
          <div>
            <h2>Private media by exact identity</h2>
            <p>
              No listing, public URL, upload, overwrite, or delete capability enters the browser
              foundation.
            </p>
          </div>
        </article>
      </section>
    </>
  );
}

export function NotFoundPage() {
  return (
    <section className="not-found">
      <p className="eyebrow">404</p>
      <h1>That Studio screen does not exist.</h1>
      <p>No action was taken and no workflow state changed.</p>
      <Link className="button-link" to="/">
        Return home
      </Link>
    </section>
  );
}
