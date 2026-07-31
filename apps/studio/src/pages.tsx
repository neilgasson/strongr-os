import { useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { preventDefault, useStudioSession } from "./session-context.tsx";

const workflowStages = [
  ["01", "Brief", "Describe the content you want to create."],
  ["02", "Draft", "Prepare and read the saved draft."],
  ["03", "Review", "Complete the safety and human reviews in order."],
  ["04", "Approve", "Approve only the exact version you reviewed."],
  ["05", "Package", "Create private files without publishing."],
] as const;

export function HomePage() {
  const { activeOrganization, authentication, capabilities, identity } = useStudioSession();
  const signedIn = authentication.status === "signed_in";

  return (
    <>
      <section className="hero" aria-labelledby="home-heading">
        <div>
          <p className="eyebrow">Strongr Studio</p>
          <h1 id="home-heading">Create and review content one clear step at a time.</h1>
          <p className="hero-copy">
            Studio keeps sensitive work protected while showing only what you need to do now and
            what comes next.
          </p>
        </div>
        <div className="hero-state" aria-label="Current access state" role="status">
          <span className="state-dot" aria-hidden="true" />
          <div>
            <strong>{signedIn ? "Signed in" : "Not signed in"}</strong>
            <span>
              {signedIn
                ? activeOrganization
                  ? `${activeOrganization.name} is selected.`
                  : "Choose an organization before opening its work."
                : "Sign in to open your work."}
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
                ? `${Object.values(capabilities.value).filter(Boolean).length} actions are available for your role.`
                : "Studio is checking which actions are available for your role."}
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
          aria-describedby={!configured || pending ? "sign-in-lock-reason" : undefined}
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
          aria-describedby={!configured || pending ? "sign-in-lock-reason" : undefined}
          autoComplete="current-password"
          disabled={!configured || pending}
          id="password"
          onChange={(event) => setPassword(event.currentTarget.value)}
          required
          type="password"
          value={password}
        />
        <button
          aria-describedby={!configured || pending ? "sign-in-lock-reason" : undefined}
          className="primary-button"
          data-primary-action
          disabled={!configured || pending}
          type="submit"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
        {!configured ? (
          <p className="permission-note" id="sign-in-lock-reason">
            This private preview is not configured. Ask the Studio operator for help.
          </p>
        ) : pending ? (
          <p className="permission-note" id="sign-in-lock-reason">
            Checking your sign-in details now…
          </p>
        ) : null}
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
  const canOfferEnrollment =
    mfa.status === "ready" && mfa.value.factors.length === 0 && totpEnrollment === null;
  const firstFactor =
    mfa.status === "ready"
      ? (mfa.value.factors.find(({ status }) => status === "verified") ?? mfa.value.factors[0])
      : undefined;
  const secureSession = mfa.status === "ready" && mfa.value.currentLevel === "aal2";

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
        <h1>Confirm sensitive actions securely.</h1>
        <p>
          Most work needs no extra step. Before a sensitive review or approval, enter the current
          six-digit code from your authenticator app.
        </p>
      </div>

      {mfa.status === "loading" || mfa.status === "idle" ? (
        <p role="status">Checking your security setup…</p>
      ) : null}
      {mfa.status === "error" ? (
        <section className="workflow-recovery" role="alert">
          <h2>Studio could not check your security setup</h2>
          <p>No security setting changed. Reload this screen and try again.</p>
          <button
            className="primary-button"
            data-primary-action
            onClick={() => globalThis.location.reload()}
            type="button"
          >
            Reload security screen
          </button>
          <details className="advanced-details">
            <summary>Advanced error details</summary>
            <p>{mfa.message}</p>
          </details>
        </section>
      ) : null}

      {secureSession ? (
        <section className="security-current-step" aria-label="Current security step">
          <p className="eyebrow">Completed</p>
          <h2>Secure session confirmed</h2>
          <p>You can return to the content workflow and complete the protected step.</p>
          <Link className="button-link" to="/content">
            Return to content
          </Link>
        </section>
      ) : null}

      {canOfferEnrollment ? (
        <section className="security-current-step" aria-label="Current security step">
          <p className="eyebrow">One-time setup</p>
          <h2>Set up extra security</h2>
          <p>You only need to do this once.</p>
          <ol className="simple-steps">
            <li>Open an authenticator app on your phone.</li>
            <li>Start setup below, then scan the QR code.</li>
            <li>Enter the current six-digit code to finish.</li>
          </ol>
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
            <details className="advanced-details">
              <summary>Advanced setup details</summary>
              <label htmlFor="factor-name">Authenticator name</label>
              <input
                id="factor-name"
                maxLength={80}
                minLength={2}
                onChange={(event) => setFriendlyName(event.currentTarget.value)}
                required
                value={friendlyName}
              />
            </details>
            <button
              aria-describedby={pending ? "start-setup-reason" : undefined}
              className="primary-button"
              data-primary-action
              disabled={pending}
              type="submit"
            >
              {pending ? "Starting setup…" : "Start setup"}
            </button>
            {pending ? (
              <p className="permission-note" id="start-setup-reason">
                Creating the one-time setup code now…
              </p>
            ) : null}
          </form>
        </section>
      ) : null}

      {totpEnrollment ? (
        <section
          className="enrollment-panel security-current-step"
          aria-label="Current security step"
          aria-labelledby="enrollment-heading"
        >
          <div>
            <p className="eyebrow">Step 2 of 2</p>
            <h2 id="enrollment-heading">Scan the code and confirm</h2>
            <p>
              Scan this one-time QR code with your authenticator app. Then enter the six-digit code
              currently shown in the app. Codes changing about every 30 seconds is normal.
            </p>
            <details className="advanced-details">
              <summary>Use a manual setup key instead</summary>
              <p>Do not share or retain this key outside your authenticator.</p>
              <code className="sensitive-value">{totpEnrollment.secret}</code>
            </details>
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

      {!secureSession && !totpEnrollment && firstFactor ? (
        <section className="security-current-step" aria-label="Current security step">
          <p className="eyebrow">Current step</p>
          <h2>Enter your current code</h2>
          <p>
            Open your authenticator app and enter the six-digit code shown for Strongr Studio. The
            code changes about every 30 seconds. That is normal—use whichever code is visible now.
          </p>
          <FactorVerificationForm
            code={codes[firstFactor.id] ?? ""}
            factorId={firstFactor.id}
            label={firstFactor.status === "verified" ? "Confirm secure session" : "Finish setup"}
            onChange={(code) => setCodes({ ...codes, [firstFactor.id]: code })}
            onSubmit={() => submitVerification(firstFactor.id)}
            pending={pending}
          />
        </section>
      ) : null}

      {mfa.status === "ready" && mfa.value.factors.length > 0 ? (
        <details className="advanced-details security-management">
          <summary>Advanced authenticator management</summary>
          <section className="factor-list" aria-labelledby="factor-list-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Current account</p>
                <h2 id="factor-list-heading">Enrolled authenticators</h2>
              </div>
            </div>
            {mfa.value.factors.map((factor) => (
              <article key={factor.id}>
                <div>
                  <h3>{factor.friendlyName}</h3>
                  <p>
                    {factor.status === "verified"
                      ? "Verified TOTP factor"
                      : "Enrollment has not been verified"}
                  </p>
                </div>
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
                    aria-describedby={
                      confirmRemoval !== factor.id || pending
                        ? `remove-factor-${factor.id}-reason`
                        : undefined
                    }
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
                  {confirmRemoval !== factor.id ? (
                    <p className="permission-note" id={`remove-factor-${factor.id}-reason`}>
                      Check the confirmation box before removing this authenticator.
                    </p>
                  ) : pending ? (
                    <p className="permission-note" id={`remove-factor-${factor.id}-reason`}>
                      Removing this authenticator now…
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </section>
        </details>
      ) : null}

      <details className="advanced-details security-explanation">
        <summary>Advanced security details</summary>
        <p>
          Strongr Studio calls this AAL2 step-up with TOTP. The browser only guides the step; each
          sensitive database command still rechecks your session, membership, tenant, and role
          permission.
        </p>
      </details>
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
      <button
        aria-describedby={pending ? `factor-code-${factorId}-reason` : undefined}
        className="primary-button"
        data-primary-action
        disabled={pending}
        type="submit"
      >
        {pending ? "Checking code…" : label}
      </button>
      {pending ? (
        <p className="permission-note" id={`factor-code-${factorId}-reason`}>
          Confirming the current code now…
        </p>
      ) : null}
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
        <h1>See what needs attention.</h1>
        <p>
          Each card shows saved work for this organization. Items that need help are clearly marked
          and never shown as complete.
        </p>
      </div>

      <div className="queue-toolbar">
        <p>
          {capabilities.status === "ready"
            ? `${Object.values(capabilities.value).filter(Boolean).length} actions are available for your role.`
            : "Studio is checking which actions are available for your role."}
        </p>
        {workQueue.status === "ready" ? (
          <button
            className="secondary-button"
            onClick={() => void refreshWorkQueue()}
            type="button"
          >
            Refresh work queue
          </button>
        ) : null}
      </div>

      {workQueue.status === "loading" || workQueue.status === "idle" ? (
        <p role="status">Loading your saved work…</p>
      ) : null}
      {workQueue.status === "error" ? (
        <section className="workflow-recovery" role="alert">
          <h2>The work queue could not load</h2>
          <p>No changes were made. Check your connection, then try again.</p>
          <button
            className="primary-button"
            data-primary-action
            onClick={() => void refreshWorkQueue()}
            type="button"
          >
            Try loading again
          </button>
          <details className="advanced-details">
            <summary>Advanced error details</summary>
            <p>{workQueue.message}</p>
          </details>
        </section>
      ) : null}
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
                      : "Saved status loaded"}
                </small>
              </article>
            ))}
          </section>
          <p className="loaded-at">Last refreshed: {workQueue.value.loadedAt}</p>
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
