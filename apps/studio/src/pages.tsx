import { useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { preventDefault, useStudioSession } from "./session-context.tsx";

const workflowStages = [
  ["01", "Brief", "Define a synthetic audio-reflection brief."],
  ["02", "Draft", "Generate and inspect an immutable version."],
  ["03", "Evidence", "Keep automated checks separate from human authority."],
  ["04", "Approve", "Bind AAL2 approval to the exact evidence snapshot."],
  ["05", "Stage", "Verify private media, stage, and revoke without publishing."],
] as const;

export function HomePage() {
  const { activeOrganization, authentication, capabilities, identity } = useStudioSession();
  const signedIn = authentication.status === "signed_in";

  return (
    <>
      <section className="hero" aria-labelledby="home-heading">
        <div>
          <p className="eyebrow">Operator console</p>
          <h1 id="home-heading">Governed work, clearly in view.</h1>
          <p className="hero-copy">
            Strongr Studio restores each operator session from Supabase Auth, discovers only active
            organizations visible through current RLS, and reconstructs work from canonical tenant
            records.
          </p>
        </div>
        <div className="hero-state" aria-label="Current access state" role="status">
          <span className="state-dot" aria-hidden="true" />
          <div>
            <strong>{signedIn ? "Signed in" : "Not signed in"}</strong>
            <span>
              {signedIn
                ? activeOrganization
                  ? `${activeOrganization.name} is the explicit tenant context.`
                  : "Choose an active organization before opening governed work."
                : "No privileged operation is available."}
            </span>
          </div>
        </div>
      </section>

      {authentication.status === "unconfigured" ? (
        <section className="notice" aria-labelledby="configuration-notice">
          <span className="notice-icon" aria-hidden="true">
            i
          </span>
          <div>
            <h2 id="configuration-notice">Public preview configuration is absent</h2>
            <p>
              Add only the isolated Supabase URL and publishable key. No service or production
              credential belongs in this browser.
            </p>
          </div>
        </section>
      ) : null}

      {signedIn && identity.status === "ready" ? (
        <section className="operator-summary" aria-labelledby="operator-heading">
          <div>
            <p className="eyebrow">Current operator</p>
            <h2 id="operator-heading">
              {identity.value.profile.preferredName ?? identity.value.profile.displayName}
            </h2>
          </div>
          <div>
            <strong>
              {identity.value.organizations.length} active organization
              {identity.value.organizations.length === 1 ? "" : "s"}
            </strong>
            <p>
              {capabilities.status === "ready"
                ? `${Object.values(capabilities.value).filter(Boolean).length} governed capabilities confirmed for the active organization.`
                : "Capabilities are not assumed until the database confirms them."}
            </p>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="flow-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Primary path</p>
            <h2 id="flow-heading">From idea to private staging</h2>
          </div>
          {activeOrganization ? (
            <Link className="text-link" to="/work">
              Open work queue
            </Link>
          ) : signedIn ? (
            <span className="muted-copy">Select an organization to continue.</span>
          ) : (
            <Link className="text-link" to="/sign-in">
              Sign in
            </Link>
          )}
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

export function SignInPage() {
  const { authentication, signIn } = useStudioSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  if (authentication.status === "signed_in") {
    return <Navigate replace to="/" />;
  }

  const configured = authentication.status !== "unconfigured";
  return (
    <section className="auth-panel" aria-labelledby="sign-in-heading">
      <p className="eyebrow">Provisioned operators only</p>
      <h1 id="sign-in-heading">Sign in to Strongr Studio</h1>
      <p>
        There is no public sign-up, invitation, password administration, or impersonation path in
        Studio.
      </p>
      <form
        onSubmit={preventDefault(async () => {
          setPending(true);
          try {
            await signIn(email, password);
          } finally {
            setPending(false);
          }
        })}
      >
        <label htmlFor="email">Email</label>
        <input
          autoComplete="username"
          disabled={!configured || pending}
          id="email"
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
          type="email"
          value={email}
        />
        <label htmlFor="password">Password</label>
        <input
          autoComplete="current-password"
          disabled={!configured || pending}
          id="password"
          onChange={(event) => setPassword(event.currentTarget.value)}
          required
          type="password"
          value={password}
        />
        <button className="primary-button" disabled={!configured || pending} type="submit">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}

export function SecurityPage() {
  const { enrollTotp, mfa, totpEnrollment, unenrollFactor, verifyFactor } = useStudioSession();
  const [friendlyName, setFriendlyName] = useState("Strongr Studio");
  const [codes, setCodes] = useState<Readonly<Record<string, string>>>({});
  const [confirmRemoval, setConfirmRemoval] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submitVerification = async (factorId: string) => {
    setPending(true);
    try {
      await verifyFactor(factorId, codes[factorId] ?? "");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Session security</p>
        <h1>Authenticator assurance stays explicit.</h1>
        <p>
          Studio can guide AAL2 step-up, but every sensitive database command rechecks real
          assurance, membership, and permission inside its transaction.
        </p>
      </div>

      <section className="security-grid" aria-label="Authenticator status">
        <article>
          <h2>Current assurance</h2>
          {mfa.status === "loading" || mfa.status === "idle" ? (
            <p role="status">Loading authenticator status…</p>
          ) : null}
          {mfa.status === "error" ? <p role="alert">{mfa.message}</p> : null}
          {mfa.status === "ready" ? (
            <>
              <strong className="assurance-level">
                {mfa.value.currentLevel?.toUpperCase() ?? "Unknown"}
              </strong>
              <p>
                {mfa.value.nextLevel === "aal2" && mfa.value.currentLevel !== "aal2"
                  ? "A verified factor is available. Enter a code below to step up this session."
                  : "Displayed assurance is guidance; the database remains authoritative."}
              </p>
            </>
          ) : null}
        </article>

        <article>
          <h2>Enroll authenticator</h2>
          <form
            onSubmit={preventDefault(async () => {
              setPending(true);
              try {
                await enrollTotp(friendlyName);
              } finally {
                setPending(false);
              }
            })}
          >
            <label htmlFor="factor-name">Authenticator name</label>
            <input
              id="factor-name"
              maxLength={80}
              minLength={2}
              onChange={(event) => setFriendlyName(event.currentTarget.value)}
              required
              value={friendlyName}
            />
            <button className="primary-button" disabled={pending} type="submit">
              Begin TOTP enrollment
            </button>
          </form>
        </article>
      </section>

      {totpEnrollment ? (
        <section className="enrollment-panel" aria-labelledby="enrollment-heading">
          <div>
            <p className="eyebrow">Enrollment in progress</p>
            <h2 id="enrollment-heading">Scan and verify</h2>
            <p>
              Scan this one-time QR code. If scanning is unavailable, enter the manual setup key. Do
              not share or retain it outside your authenticator.
            </p>
            <code className="sensitive-value">{totpEnrollment.secret}</code>
          </div>
          <img alt="One-time TOTP enrollment QR code" src={totpEnrollment.qrCode} />
          <FactorVerificationForm
            code={codes[totpEnrollment.factorId] ?? ""}
            factorId={totpEnrollment.factorId}
            label="Finish enrollment"
            onChange={(code) => setCodes({ ...codes, [totpEnrollment.factorId]: code })}
            onSubmit={() => submitVerification(totpEnrollment.factorId)}
            pending={pending}
          />
        </section>
      ) : null}

      <section className="factor-list" aria-labelledby="factor-list-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current account</p>
            <h2 id="factor-list-heading">TOTP authenticators</h2>
          </div>
        </div>
        {mfa.status === "ready" && mfa.value.factors.length === 0 ? (
          <p>No TOTP authenticators are enrolled.</p>
        ) : null}
        {mfa.status === "ready"
          ? mfa.value.factors.map((factor) => (
              <article key={factor.id}>
                <div>
                  <h3>{factor.friendlyName}</h3>
                  <p>
                    {factor.status === "verified"
                      ? "Verified TOTP factor"
                      : "Enrollment has not been verified"}
                  </p>
                </div>
                <FactorVerificationForm
                  code={codes[factor.id] ?? ""}
                  factorId={factor.id}
                  label={factor.status === "verified" ? "Step up session" : "Verify enrollment"}
                  onChange={(code) => setCodes({ ...codes, [factor.id]: code })}
                  onSubmit={() => submitVerification(factor.id)}
                  pending={pending}
                />
                <div className="remove-factor">
                  <label>
                    <input
                      checked={confirmRemoval === factor.id}
                      onChange={(event) =>
                        setConfirmRemoval(event.currentTarget.checked ? factor.id : null)
                      }
                      type="checkbox"
                    />
                    Confirm removal of {factor.friendlyName}
                  </label>
                  <button
                    className="danger-button"
                    disabled={confirmRemoval !== factor.id || pending}
                    onClick={() => {
                      setPending(true);
                      void unenrollFactor(factor.id).finally(() => {
                        setPending(false);
                        setConfirmRemoval(null);
                      });
                    }}
                    type="button"
                  >
                    Remove authenticator
                  </button>
                </div>
              </article>
            ))
          : null}
      </section>
    </>
  );
}

function FactorVerificationForm({
  code,
  factorId,
  label,
  onChange,
  onSubmit,
  pending,
}: {
  readonly code: string;
  readonly factorId: string;
  readonly label: string;
  readonly onChange: (code: string) => void;
  readonly onSubmit: () => void;
  readonly pending: boolean;
}) {
  return (
    <form className="verification-form" onSubmit={preventDefault(onSubmit)}>
      <label htmlFor={`factor-code-${factorId}`}>Six-digit authenticator code</label>
      <input
        autoComplete="one-time-code"
        id={`factor-code-${factorId}`}
        inputMode="numeric"
        maxLength={6}
        onChange={(event) => onChange(event.currentTarget.value.replace(/\D/g, ""))}
        pattern="[0-9]{6}"
        required
        value={code}
      />
      <button className="secondary-button" disabled={pending} type="submit">
        {label}
      </button>
    </form>
  );
}

export function WorkQueuePage() {
  const { activeOrganization, capabilities, refreshWorkQueue, workQueue } = useStudioSession();
  if (!activeOrganization) {
    return null;
  }

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Work queue · {activeOrganization.name}</p>
        <h1>Canonical work, reconstructed safely.</h1>
        <p>
          Counts come from current tenant-scoped records. Empty, loading, failed, blocked, and
          revoked states are never presented as success.
        </p>
      </div>

      <div className="queue-toolbar">
        <p>
          {capabilities.status === "ready"
            ? `${Object.values(capabilities.value).filter(Boolean).length} governed capabilities are available for usability guidance.`
            : "Governed actions remain unavailable until permissions are confirmed."}
        </p>
        <button
          className="secondary-button"
          disabled={workQueue.status === "loading"}
          onClick={() => void refreshWorkQueue()}
          type="button"
        >
          Refresh canonical status
        </button>
      </div>

      {workQueue.status === "loading" || workQueue.status === "idle" ? (
        <p role="status">Loading canonical tenant work…</p>
      ) : null}
      {workQueue.status === "error" ? <p role="alert">{workQueue.message}</p> : null}
      {workQueue.status === "ready" ? (
        <>
          <section className="queue-grid" aria-label="Work queue lanes">
            {workQueue.value.lanes.map((lane) => (
              <article className={`queue-card queue-card--${lane.status}`} key={lane.key}>
                <div className="queue-card-heading">
                  <h2>{lane.label}</h2>
                  <span>
                    <span className="visually-hidden">{lane.count} items</span>
                    {lane.count}
                  </span>
                </div>
                <p>
                  {lane.count === 0 && lane.status === "ready" ? "Nothing waiting." : lane.detail}
                </p>
                <small>
                  {lane.status === "failed"
                    ? "Read failed safely"
                    : lane.status === "attention"
                      ? "Needs operator attention"
                      : "Canonical status loaded"}
                </small>
              </article>
            ))}
          </section>
          <p className="loaded-at">Last reconstructed: {workQueue.value.loadedAt}</p>
        </>
      ) : null}
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
            <h2>Canonical identity and tenant context</h2>
            <p>
              Organizations come from active memberships allowed by RLS. Permission-aware controls
              remain usability guidance while the database rechecks every governed command.
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
