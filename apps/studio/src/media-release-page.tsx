import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type {
  MediaAccessibilityStatus,
  MediaReviewDecision,
  MediaTranscriptStatus,
  TenantMediaArtifactSummary,
  TenantMediaReviewSummary,
  Uuid,
} from "../../../packages/contracts/src/index.ts";

import { MediaReleaseOperatorFlow, type MediaReleaseWorkspace } from "./media-release-flow.ts";
import { useStudioSession } from "./session-context.tsx";

type WorkspaceState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ message: string; status: "error" }>
  | Readonly<{ status: "ready"; value: MediaReleaseWorkspace }>;

type OperationNotice = Readonly<{ kind: "error" | "success"; message: string }>;

interface VerifiedPlayback {
  readonly artifactId: Uuid;
  readonly byteCount: number;
  readonly sha256: string;
  readonly url: string;
}

type MediaWorkflowStepKey = "request" | "create" | "verify" | "review" | "stage";
type MediaWorkflowStepStatus = "blocked" | "completed" | "current" | "upcoming";
type MediaCurrentAction = "complete" | MediaWorkflowStepKey | "revoked";

const mediaWorkflowSteps: readonly Readonly<{
  key: MediaWorkflowStepKey;
  label: string;
}>[] = [
  { key: "request", label: "Request private audio" },
  { key: "create", label: "Create and validate audio" },
  { key: "verify", label: "Listen to the verified audio" },
  { key: "review", label: "Record the human review" },
  { key: "stage", label: "Stage the private release" },
];

function newUuid(): Uuid {
  return globalThis.crypto.randomUUID();
}

function newIdempotencyKey(): string {
  return `studio-m3-3-${newUuid()}`;
}

function shortHash(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown time" : date.toLocaleString();
}

function submit(handler: () => void | Promise<void>) {
  return (event: FormEvent) => {
    event.preventDefault();
    void handler();
  };
}

export function MediaReleasePage() {
  const { activeOrganization, announce, capabilities, foundation, mfa, reportWorkflowFailure } =
    useStudioSession();
  const [workspace, setWorkspace] = useState<WorkspaceState>({ status: "loading" });
  const [pending, setPending] = useState<string | null>(null);
  const [playback, setPlayback] = useState<VerifiedPlayback | null>(null);
  const [verifiedArtifactId, setVerifiedArtifactId] = useState<Uuid | null>(null);
  const [notice, setNotice] = useState<OperationNotice | null>(null);
  const mutationLock = useRef(false);
  const flow = useMemo(
    () => (foundation ? new MediaReleaseOperatorFlow(foundation) : null),
    [foundation],
  );

  const closePlayback = useCallback(() => {
    setPlayback((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }, []);

  useEffect(
    () => () => {
      if (playback) {
        URL.revokeObjectURL(playback.url);
      }
    },
    [playback],
  );

  const refresh = useCallback(async () => {
    if (!activeOrganization || !flow) {
      return;
    }
    setWorkspace({ status: "loading" });
    try {
      setWorkspace({
        status: "ready",
        value: await flow.loadWorkspace(activeOrganization.id),
      });
    } catch (error) {
      reportWorkflowFailure(error, "The private audio workspace could not be loaded");
      setWorkspace({
        message:
          "Your private audio work could not be loaded. Nothing was changed. Try loading it again.",
        status: "error",
      });
    }
  }, [activeOrganization, flow, reportWorkflowFailure]);

  useEffect(() => {
    closePlayback();
    setVerifiedArtifactId(null);
    void refresh();
  }, [closePlayback, refresh]);

  const execute = useCallback(
    async (key: string, success: string, failure: string, action: () => Promise<unknown>) => {
      if (mutationLock.current) {
        return;
      }
      mutationLock.current = true;
      setPending(key);
      setNotice(null);
      try {
        await action();
        setNotice({ kind: "success", message: success });
        announce(success);
      } catch (error) {
        setNotice({
          kind: "error",
          message: `${failure}. Nothing was published or approved. This step is still open so you can try again.`,
        });
        reportWorkflowFailure(error, failure);
      } finally {
        await refresh();
        mutationLock.current = false;
        setPending(null);
      }
    },
    [announce, refresh, reportWorkflowFailure],
  );

  if (!activeOrganization || !flow) {
    return null;
  }

  const aal2 = mfa.status === "ready" && mfa.value.currentLevel === "aal2";
  const permission = (
    name: "media.request" | "media.review" | "release.stage" | "release.revoke",
  ) => capabilities.status === "ready" && capabilities.value[name];

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Private audio · {activeOrganization.name}</p>
        <h1>Prepare one private audio release.</h1>
        <p>
          Studio shows the next step and keeps the audio private. Staging prepares a release for
          later use; it never publishes it.
        </p>
      </div>

      {notice ? (
        <section
          className={`workflow-notice${notice.kind === "error" ? " workflow-notice--error" : ""}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <strong>{notice.kind === "error" ? "This step did not finish" : "Step completed"}</strong>
          <p>{notice.message}</p>
          <button className="text-button" onClick={() => setNotice(null)} type="button">
            Dismiss
          </button>
        </section>
      ) : null}

      {workspace.status === "loading" ? (
        <p role="status">Loading your private audio work…</p>
      ) : null}
      {workspace.status === "error" ? (
        <section className="workflow-recovery" role="alert">
          <strong>Studio could not load this work.</strong>
          <p>{workspace.message}</p>
          <button
            className="primary-button"
            data-primary-action="true"
            onClick={() => void refresh()}
            type="button"
          >
            Try loading again
          </button>
        </section>
      ) : null}
      {workspace.status === "ready" ? (
        <MediaGuidedWorkspace
          aal2={aal2}
          canRequest={permission("media.request")}
          canReview={permission("media.review")}
          canRevoke={permission("release.revoke")}
          canStage={permission("release.stage")}
          closePlayback={closePlayback}
          execute={execute}
          flow={flow}
          organizationId={activeOrganization.id}
          pending={pending !== null}
          playback={playback}
          refresh={refresh}
          reportWorkflowFailure={reportWorkflowFailure}
          setNotice={setNotice}
          setPending={setPending}
          setPlayback={setPlayback}
          setVerifiedArtifactId={setVerifiedArtifactId}
          verifiedArtifactId={verifiedArtifactId}
          workspace={workspace.value}
        />
      ) : null}

      <details className="advanced-details workflow-advanced">
        <summary>Advanced security details</summary>
        <p>
          Sensitive requests and staging commands require a confirmed authenticator session. Every
          command is checked again for organization membership, role permission, and tenant
          isolation before it runs. Audio playback is checksum-verified and stays in memory.
        </p>
        <p className="operation-detail">
          Current authentication assurance: {aal2 ? "AAL2 confirmed" : "AAL2 not confirmed"}.
        </p>
      </details>
    </>
  );
}

function MediaGuidedWorkspace({
  aal2,
  canRequest,
  canReview,
  canRevoke,
  canStage,
  closePlayback,
  execute,
  flow,
  organizationId,
  pending,
  playback,
  refresh,
  reportWorkflowFailure,
  setNotice,
  setPending,
  setPlayback,
  setVerifiedArtifactId,
  verifiedArtifactId,
  workspace,
}: {
  readonly aal2: boolean;
  readonly canRequest: boolean;
  readonly canReview: boolean;
  readonly canRevoke: boolean;
  readonly canStage: boolean;
  readonly closePlayback: () => void;
  readonly execute: (
    key: string,
    success: string,
    failure: string,
    action: () => Promise<unknown>,
  ) => Promise<void>;
  readonly flow: MediaReleaseOperatorFlow;
  readonly organizationId: Uuid;
  readonly pending: boolean;
  readonly playback: VerifiedPlayback | null;
  readonly refresh: () => Promise<void>;
  readonly reportWorkflowFailure: (error: unknown, fallback: string) => void;
  readonly setNotice: (value: OperationNotice | null) => void;
  readonly setPending: (value: string | null) => void;
  readonly setPlayback: (value: VerifiedPlayback | null) => void;
  readonly setVerifiedArtifactId: (value: Uuid | null) => void;
  readonly verifiedArtifactId: Uuid | null;
  readonly workspace: MediaReleaseWorkspace;
}) {
  const revokedApprovalIds = new Set(
    workspace.approvalRevocations.map(({ approvalSnapshotId }) => approvalSnapshotId),
  );
  const packages = workspace.productionPackages.filter(
    ({ approvalSnapshotId }) => !revokedApprovalIds.has(approvalSnapshotId),
  );
  const [packageId, setPackageId] = useState(packages[0]?.id ?? "");
  const [outputSpecId, setOutputSpecId] = useState(workspace.outputSpecs[0]?.id ?? "");

  useEffect(() => {
    setPackageId((current) =>
      packages.some(({ id }) => id === current) ? current : (packages[0]?.id ?? ""),
    );
  }, [packages]);
  useEffect(() => {
    setOutputSpecId((current) =>
      workspace.outputSpecs.some(({ id }) => id === current)
        ? current
        : (workspace.outputSpecs[0]?.id ?? ""),
    );
  }, [workspace.outputSpecs]);

  const jobs = workspace.jobs.filter(
    ({ productionPackageId }) => productionPackageId === packageId,
  );
  const artifacts = workspace.artifacts.filter(
    ({ productionPackageId }) => productionPackageId === packageId,
  );
  const [artifactId, setArtifactId] = useState(artifacts[0]?.id ?? "");

  useEffect(() => {
    setArtifactId((current) =>
      artifacts.some(({ id }) => id === current) ? current : (artifacts[0]?.id ?? ""),
    );
  }, [artifacts]);

  const artifact = artifacts.find(({ id }) => id === artifactId);
  const reviews = workspace.reviews.filter(
    ({ mediaArtifactId }) => Boolean(artifact) && mediaArtifactId === artifactId,
  );
  const eligibleReviews = reviews.filter(
    ({ accessibilityStatus, decision, transcriptStatus }) =>
      decision === "approved" && transcriptStatus === "ready" && accessibilityStatus === "approved",
  );
  const preferredReview =
    eligibleReviews.find((candidate) =>
      workspace.stagedBundles.some(({ mediaReviewId }) => mediaReviewId === candidate.id),
    ) ?? eligibleReviews[0];
  const [reviewId, setReviewId] = useState(preferredReview?.id ?? "");
  const revocationByBundle = new Map(
    workspace.stagedRevocations.map((item) => [item.stagedReleaseBundleId, item]),
  );

  useEffect(() => {
    setReviewId((current) =>
      eligibleReviews.some(({ id }) => id === current) ? current : (preferredReview?.id ?? ""),
    );
  }, [eligibleReviews, preferredReview?.id]);

  const eligibleReview = eligibleReviews.find(({ id }) => id === reviewId);
  const stagedBundle = workspace.stagedBundles.find(
    (bundle) =>
      bundle.productionPackageId === packageId &&
      bundle.mediaArtifactId === artifactId &&
      bundle.mediaReviewId === reviewId,
  );
  const stagedRevocation = stagedBundle ? revocationByBundle.get(stagedBundle.id) : undefined;
  const activeJob =
    jobs.find(({ state }) => ["queued", "running", "succeeded"].includes(state)) ?? jobs[0];
  const jobFailed =
    Boolean(activeJob) &&
    ["cancelled", "dead_letter", "failed"].includes(activeJob?.state ?? "queued");
  const playbackVerified = verifiedArtifactId === artifactId;

  useEffect(() => {
    if (
      (playback && playback.artifactId !== artifactId) ||
      (verifiedArtifactId && verifiedArtifactId !== artifactId)
    ) {
      closePlayback();
      setVerifiedArtifactId(null);
    }
  }, [artifactId, closePlayback, playback, setVerifiedArtifactId, verifiedArtifactId]);

  let currentAction: MediaCurrentAction;
  if (stagedBundle && stagedRevocation) {
    currentAction = "revoked";
  } else if (stagedBundle) {
    currentAction = "complete";
  } else if (eligibleReview) {
    currentAction = "stage";
  } else if (artifact && playbackVerified) {
    currentAction = "review";
  } else if (artifact) {
    currentAction = "verify";
  } else if (activeJob && !jobFailed) {
    currentAction = "create";
  } else {
    currentAction = "request";
  }

  let blockedReason: string | null = null;
  let recoveryAction: "content" | "security" | null = null;
  if (currentAction === "request") {
    if (packages.length === 0) {
      blockedReason =
        "An approved content package is required first. Finish the content approval and package step, then return here.";
      recoveryAction = "content";
    } else if (workspace.outputSpecs.length === 0) {
      blockedReason =
        "The standard private-audio format is not available. Ask a Studio administrator to restore the audio configuration.";
    } else if (!canRequest) {
      blockedReason =
        "Your role cannot request audio. Ask an organization owner to grant the media request permission.";
    } else if (!aal2) {
      blockedReason =
        "Confirm your authenticator once before requesting audio. You will return to this step afterward.";
      recoveryAction = "security";
    }
  } else if (currentAction === "review" && !canReview) {
    blockedReason =
      "Your role cannot record an audio review. Ask an organization owner to grant the media review permission.";
  } else if (currentAction === "stage") {
    if (!canStage) {
      blockedReason =
        "Your role cannot stage a private release. Ask an organization owner to grant the release staging permission.";
    } else if (!aal2) {
      blockedReason =
        "Confirm your authenticator once before staging this private release. You will return to this step afterward.";
      recoveryAction = "security";
    }
  }

  const completedSteps = new Set<MediaWorkflowStepKey>();
  if (activeJob && !jobFailed) {
    completedSteps.add("request");
  }
  if (artifact) {
    completedSteps.add("request");
    completedSteps.add("create");
  }
  if (playbackVerified || (reviews.length > 0 && currentAction !== "verify")) {
    completedSteps.add("verify");
  }
  if (eligibleReview) {
    completedSteps.add("review");
  }
  if (stagedBundle) {
    completedSteps.add("stage");
  }

  const currentStep =
    currentAction === "complete" || currentAction === "revoked" ? null : currentAction;
  const stepStatuses = new Map<MediaWorkflowStepKey, MediaWorkflowStepStatus>();
  let foundCurrent = false;
  for (const step of mediaWorkflowSteps) {
    let status: MediaWorkflowStepStatus;
    if (completedSteps.has(step.key)) {
      status = "completed";
    } else if (step.key === currentStep) {
      status = blockedReason ? "blocked" : "current";
      foundCurrent = true;
    } else {
      status = foundCurrent ? "upcoming" : "upcoming";
    }
    stepStatuses.set(step.key, status);
  }

  const currentCopy = currentActionCopy(currentAction, jobFailed);

  return (
    <section className="workflow-section" aria-labelledby="media-workflow-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Private release workflow</p>
          <h2 id="media-workflow-heading">Follow the highlighted step.</h2>
        </div>
        <span className="status-pill status-pill--neutral">
          {completedSteps.size} of {mediaWorkflowSteps.length}
        </span>
      </div>

      {packages.length > 1 || artifacts.length > 1 ? (
        <div className="form-grid">
          {packages.length > 1 ? (
            <label>
              Content item
              <select
                onChange={(event) => setPackageId(event.currentTarget.value)}
                value={packageId}
              >
                {packages.map((item, index) => (
                  <option key={item.id} value={item.id}>
                    Content package {index + 1} · created {formatDate(item.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {artifacts.length > 1 ? (
            <label>
              Audio version
              <select
                onChange={(event) => setArtifactId(event.currentTarget.value)}
                value={artifactId}
              >
                {artifacts.map((item, index) => (
                  <option key={item.id} value={item.id}>
                    Audio {index + 1} · {Math.round(item.durationMs / 1_000)} seconds
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      <ol className="workflow-progress" aria-label="Private audio progress">
        {mediaWorkflowSteps.map((step, index) => {
          const status = stepStatuses.get(step.key) ?? "upcoming";
          return (
            <li
              aria-current={status === "current" || status === "blocked" ? "step" : undefined}
              className={`workflow-progress__item workflow-progress__item--${status}`}
              key={step.key}
            >
              <span aria-hidden="true" className="workflow-progress__marker" />
              <strong>
                {index + 1}. {step.label}
              </strong>
              <span>
                {status === "completed"
                  ? "Done"
                  : status === "current"
                    ? "Current"
                    : status === "blocked"
                      ? "Blocked"
                      : "Later"}
              </span>
            </li>
          );
        })}
      </ol>

      <div
        className={`workflow-current-action${blockedReason ? " workflow-current-action--blocked" : ""}`}
      >
        <p className="eyebrow">
          {currentAction === "complete"
            ? "Ready"
            : currentAction === "revoked"
              ? "Withdrawn"
              : blockedReason
                ? "Current step · blocked"
                : "Current step"}
        </p>
        <h3>{currentCopy.title}</h3>
        <p>{currentCopy.description}</p>

        {blockedReason ? (
          <div className="workflow-blocked">
            <p role="status">{blockedReason}</p>
            {recoveryAction === "content" ? (
              <Link className="button-link" data-primary-action="true" to="/content">
                Open governed content
              </Link>
            ) : null}
            {recoveryAction === "security" ? (
              <Link className="button-link" data-primary-action="true" to="/security">
                Confirm authenticator
              </Link>
            ) : null}
          </div>
        ) : null}

        {!blockedReason && currentAction === "request" ? (
          <MediaRequestAction
            execute={execute}
            flow={flow}
            jobFailed={jobFailed}
            jobs={jobs}
            organizationId={organizationId}
            outputSpecId={outputSpecId}
            packageId={packageId}
            packages={packages}
            pending={pending}
            setOutputSpecId={setOutputSpecId}
            setPackageId={setPackageId}
            workspace={workspace}
          />
        ) : null}
        {!blockedReason && currentAction === "create" ? (
          <div className="simple-action">
            <p>
              Studio is creating and validating the audio. This page does not retry or duplicate the
              request automatically.
            </p>
            <button
              className="primary-button"
              data-primary-action="true"
              disabled={pending}
              onClick={() => void refresh()}
              type="button"
            >
              {pending ? "Checking…" : "Check audio status"}
            </button>
            <p className="permission-note">
              If the job remains here, wait a moment and check again. If it fails, Studio will show
              the request step again.
            </p>
          </div>
        ) : null}
        {!blockedReason && currentAction === "verify" ? (
          <ArtifactAction
            artifactId={artifactId}
            artifacts={artifacts}
            closePlayback={closePlayback}
            execute={execute}
            flow={flow}
            mode="verify"
            organizationId={organizationId}
            pending={pending}
            playback={playback}
            reportWorkflowFailure={reportWorkflowFailure}
            reviews={reviews}
            setArtifactId={setArtifactId}
            setNotice={setNotice}
            setPending={setPending}
            setPlayback={setPlayback}
            setVerifiedArtifactId={setVerifiedArtifactId}
          />
        ) : null}
        {!blockedReason && currentAction === "review" ? (
          <ArtifactAction
            artifactId={artifactId}
            artifacts={artifacts}
            closePlayback={closePlayback}
            execute={execute}
            flow={flow}
            mode="review"
            organizationId={organizationId}
            pending={pending}
            playback={playback}
            reportWorkflowFailure={reportWorkflowFailure}
            reviews={reviews}
            setArtifactId={setArtifactId}
            setNotice={setNotice}
            setPending={setPending}
            setPlayback={setPlayback}
            setVerifiedArtifactId={setVerifiedArtifactId}
          />
        ) : null}
        {!blockedReason && currentAction === "stage" ? (
          <StageReleaseAction
            artifact={artifact}
            eligibleReviews={eligibleReviews}
            execute={execute}
            flow={flow}
            organizationId={organizationId}
            pending={pending}
            reviewId={reviewId}
            setReviewId={setReviewId}
          />
        ) : null}
        {currentAction === "complete" && stagedBundle ? (
          <div className="simple-action">
            <strong>Private release staged.</strong>
            <p>
              The immutable private bundle is ready for the next authorized workflow. Nothing was
              published.
            </p>
          </div>
        ) : null}
        {currentAction === "revoked" ? (
          <div className="workflow-blocked">
            <strong>This private release was withdrawn.</strong>
            <p>
              Its authority is revoked and it cannot be published. Start with a newly approved
              content package if another release is needed.
            </p>
          </div>
        ) : null}
      </div>

      <details className="advanced-details workflow-advanced">
        <summary>Advanced workflow details</summary>
        <p>
          These records support audit and troubleshooting. Normal work does not require copying or
          understanding them.
        </p>
        <TechnicalMediaDetails
          jobs={jobs}
          reviews={reviews}
          stagedBundle={stagedBundle}
          stagedRevocation={stagedRevocation}
        />
      </details>

      {workspace.stagedBundles.some((bundle) => !revocationByBundle.has(bundle.id)) ? (
        <RevocationManagement
          aal2={aal2}
          allowed={canRevoke}
          execute={execute}
          flow={flow}
          organizationId={organizationId}
          pending={pending}
          revocationByBundle={revocationByBundle}
          workspace={workspace}
        />
      ) : null}
    </section>
  );
}

function currentActionCopy(
  action: MediaCurrentAction,
  retry: boolean,
): Readonly<{ description: string; title: string }> {
  switch (action) {
    case "request":
      return retry
        ? {
            description:
              "The previous audio job did not finish. Review the selected package, then make one new request.",
            title: "Try the private audio request again",
          }
        : {
            description:
              "Choose the approved content package and the standard audio format. This creates private work only.",
            title: "Request the private audio",
          };
    case "create":
      return {
        description:
          "The request was accepted. Wait for Studio to finish and validate the private audio.",
        title: "Wait for the private audio",
      };
    case "verify":
      return {
        description:
          "Studio verifies the private file before playback. Listen to it before recording a review.",
        title: "Verify and listen",
      };
    case "review":
      return {
        description:
          "Record what you heard and whether the transcript and accessibility requirements are ready.",
        title: "Record the human review",
      };
    case "stage":
      return {
        description:
          "Confirm the approved review and create an immutable private bundle. This does not publish.",
        title: "Stage the private release",
      };
    case "revoked":
      return {
        description:
          "The append-only revocation remains in the audit trail and blocks this bundle from use.",
        title: "Release authority withdrawn",
      };
    case "complete":
      return {
        description:
          "The approved audio is in a private staged bundle. No public release has occurred.",
        title: "Private release ready",
      };
  }
}

function MediaRequestAction({
  execute,
  flow,
  jobFailed,
  jobs,
  organizationId,
  outputSpecId,
  packageId,
  packages,
  pending,
  setOutputSpecId,
  setPackageId,
  workspace,
}: {
  readonly execute: (
    key: string,
    success: string,
    failure: string,
    action: () => Promise<unknown>,
  ) => Promise<void>;
  readonly flow: MediaReleaseOperatorFlow;
  readonly jobFailed: boolean;
  readonly jobs: MediaReleaseWorkspace["jobs"];
  readonly organizationId: Uuid;
  readonly outputSpecId: string;
  readonly packageId: string;
  readonly packages: MediaReleaseWorkspace["productionPackages"];
  readonly pending: boolean;
  readonly setOutputSpecId: (value: string) => void;
  readonly setPackageId: (value: string) => void;
  readonly workspace: MediaReleaseWorkspace;
}) {
  const [confirm, setConfirm] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const selectedPackage = packages.find(({ id }) => id === packageId);
  const selectedSpec = workspace.outputSpecs.find(({ id }) => id === outputSpecId);
  const disabled = !packageId || !outputSpecId || !confirm || pending;

  return (
    <article className="authority-card">
      {jobFailed ? (
        <p className="permission-note">
          The last audio job could not finish. No audio was staged or published. A new request uses
          a new request key and does not change the failed record.
        </p>
      ) : null}
      <label>
        Approved content package
        <select onChange={(event) => setPackageId(event.currentTarget.value)} value={packageId}>
          {packages.map((item, index) => (
            <option key={item.id} value={item.id}>
              Package {index + 1} · created {formatDate(item.createdAt)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Audio format
        <select
          onChange={(event) => setOutputSpecId(event.currentTarget.value)}
          value={outputSpecId}
        >
          {workspace.outputSpecs.map((spec) => (
            <option key={spec.id} value={spec.id}>
              Standard private WAV audio · up to {Math.round(spec.maxDurationMs / 60_000)} minutes
            </option>
          ))}
        </select>
      </label>
      <label className="confirmation-label">
        <input
          checked={confirm}
          onChange={(event) => setConfirm(event.currentTarget.checked)}
          type="checkbox"
        />
        I confirm the selected approved package. This creates private audio work and does not
        publish.
      </label>
      <button
        aria-describedby={disabled ? "request-media-disabled" : undefined}
        className="primary-button"
        data-primary-action="true"
        disabled={disabled}
        onClick={() => {
          void execute(
            "request-media",
            "Private audio request accepted. Studio is now tracking its progress.",
            "The private audio request did not finish",
            async () => {
              await flow.requestMedia({
                adapterKey: "strongr.synthetic_audio",
                adapterVersion: "1.0.0",
                correlationId: newUuid(),
                idempotencyKey,
                organizationId,
                outputSpecId,
                productionPackageId: packageId,
              });
              setIdempotencyKey(newIdempotencyKey());
            },
          ).finally(() => setConfirm(false));
        }}
        type="button"
      >
        {pending
          ? "Requesting…"
          : jobFailed
            ? "Request private audio again"
            : "Request private audio"}
      </button>
      {disabled ? (
        <p className="permission-note" id="request-media-disabled">
          {pending
            ? "Studio is saving this request. Wait for it to finish."
            : "Select the package and audio format, then check the confirmation box."}
        </p>
      ) : null}
      <details className="advanced-details">
        <summary>Advanced request details</summary>
        <p className="operation-detail">
          Package {selectedPackage?.id ?? "not selected"} · manifest{" "}
          {selectedPackage ? shortHash(selectedPackage.manifestHash) : "unavailable"}
        </p>
        <p className="operation-detail">
          Output specification {selectedSpec?.id ?? "not selected"} ·{" "}
          {selectedSpec
            ? `${selectedSpec.sampleRateHz} Hz mono ${selectedSpec.container} · ${shortHash(selectedSpec.specHash)}`
            : "unavailable"}
        </p>
        <p className="operation-detail">
          Stable request key: <code>{idempotencyKey}</code>
        </p>
        {jobs.map((job) => (
          <p className="status-copy" key={job.id}>
            Job {job.id} · {job.state} · attempt {job.attemptCount}/{job.maxAttempts}
            {job.lastErrorCode ? ` · ${job.lastErrorCode}` : ""}
          </p>
        ))}
      </details>
    </article>
  );
}

function ArtifactAction({
  artifactId,
  artifacts,
  closePlayback,
  execute,
  flow,
  mode,
  organizationId,
  pending,
  playback,
  reportWorkflowFailure,
  reviews,
  setArtifactId,
  setNotice,
  setPending,
  setPlayback,
  setVerifiedArtifactId,
}: {
  readonly artifactId: string;
  readonly artifacts: MediaReleaseWorkspace["artifacts"];
  readonly closePlayback: () => void;
  readonly execute: (
    key: string,
    success: string,
    failure: string,
    action: () => Promise<unknown>,
  ) => Promise<void>;
  readonly flow: MediaReleaseOperatorFlow;
  readonly mode: "review" | "verify";
  readonly organizationId: Uuid;
  readonly pending: boolean;
  readonly playback: VerifiedPlayback | null;
  readonly reportWorkflowFailure: (error: unknown, fallback: string) => void;
  readonly reviews: MediaReleaseWorkspace["reviews"];
  readonly setArtifactId: (value: string) => void;
  readonly setNotice: (value: OperationNotice | null) => void;
  readonly setPending: (value: string | null) => void;
  readonly setPlayback: (value: VerifiedPlayback | null) => void;
  readonly setVerifiedArtifactId: (value: Uuid | null) => void;
}) {
  const [decision, setDecision] = useState<MediaReviewDecision>("approved");
  const [transcriptStatus, setTranscriptStatus] = useState<MediaTranscriptStatus>("ready");
  const [accessibilityStatus, setAccessibilityStatus] =
    useState<MediaAccessibilityStatus>("approved");
  const [evidence, setEvidence] = useState("");
  const [confirmReview, setConfirmReview] = useState(false);
  const artifact = artifacts.find(({ id }) => id === artifactId);

  const verify = async () => {
    if (!artifact || pending) {
      return;
    }
    closePlayback();
    setPending("verify-artifact");
    setNotice(null);
    try {
      const verified = await flow.downloadArtifact(organizationId, artifact.id);
      const bytes = verified.bytes.slice();
      const url = URL.createObjectURL(new Blob([bytes.buffer], { type: "audio/wav" }));
      setPlayback({
        artifactId: artifact.id,
        byteCount: bytes.byteLength,
        sha256: verified.sha256,
        url,
      });
      setVerifiedArtifactId(artifact.id);
      setNotice({
        kind: "success",
        message: "The private audio was verified. Listen to it, then record your review.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          "The private audio could not be verified. Nothing was changed. Try this step again.",
      });
      reportWorkflowFailure(error, "The private audio was not verified for playback");
    } finally {
      setPending(null);
    }
  };

  const reviewDisabled = !artifactId || evidence.trim().length === 0 || !confirmReview || pending;

  return (
    <article className="authority-card">
      <label>
        Private audio
        <select onChange={(event) => setArtifactId(event.currentTarget.value)} value={artifactId}>
          {artifacts.map((item, index) => (
            <option key={item.id} value={item.id}>
              Audio {index + 1} · {Math.round(item.durationMs / 1_000)} seconds · validated{" "}
              {formatDate(item.validatedAt)}
            </option>
          ))}
        </select>
      </label>

      {mode === "verify" ? (
        <>
          {reviews.length > 0 ? (
            <p className="permission-note">
              A previous review did not make this audio eligible. Listen again before recording a
              new decision.
            </p>
          ) : null}
          <button
            aria-describedby={pending ? "verify-audio-disabled" : undefined}
            className="primary-button"
            data-primary-action="true"
            disabled={!artifact || pending}
            onClick={() => void verify()}
            type="button"
          >
            {pending ? "Verifying…" : "Verify and listen"}
          </button>
          {pending ? (
            <p className="permission-note" id="verify-audio-disabled">
              Studio is verifying the private file. Wait for this check to finish.
            </p>
          ) : null}
        </>
      ) : null}

      {mode === "review" ? (
        <>
          {playback && playback.artifactId === artifactId ? (
            <div className="confirmation-panel">
              <div>
                <strong>Private audio verified.</strong>
                <p>Listen to the complete audio before saving the human review.</p>
              </div>
              {/* biome-ignore lint/a11y/useMediaCaption: This private review surface presents adjacent governed transcript evidence; it does not publish media. */}
              <audio controls onEnded={closePlayback} preload="metadata" src={playback.url}>
                Your browser does not support audio playback.
              </audio>
              <button className="text-button" onClick={closePlayback} type="button">
                Close playback
              </button>
            </div>
          ) : (
            <p className="status-copy">
              The private audio was verified. Playback is closed, but this review still targets the
              same verified file.
            </p>
          )}
          <form
            className="workflow-form"
            onSubmit={submit(() =>
              execute(
                "record-media-review",
                "Human audio review saved. Studio is ready for the next step.",
                "The human audio review did not finish",
                () =>
                  flow.recordReview({
                    accessibilityStatus,
                    correlationId: newUuid(),
                    decision,
                    evidence: {
                      note: evidence.trim(),
                      source: "strongr_studio_m3_3",
                      canonical_artifact_sha256: artifact?.sha256 ?? "",
                    },
                    mediaArtifactId: artifactId,
                    organizationId,
                    reasonCode: "m3_3_operator_media_review",
                    transcriptStatus,
                  }),
              ).finally(() => setConfirmReview(false)),
            )}
          >
            <div className="form-grid">
              <label>
                Overall decision
                <select
                  onChange={(event) =>
                    setDecision(event.currentTarget.value as MediaReviewDecision)
                  }
                  value={decision}
                >
                  <option value="approved">Approve</option>
                  <option value="changes_requested">Request changes</option>
                  <option value="rejected">Reject</option>
                </select>
              </label>
              <label>
                Transcript
                <select
                  onChange={(event) =>
                    setTranscriptStatus(event.currentTarget.value as MediaTranscriptStatus)
                  }
                  value={transcriptStatus}
                >
                  <option value="ready">Ready</option>
                  <option value="blocked">Needs work</option>
                </select>
              </label>
              <label>
                Accessibility
                <select
                  onChange={(event) =>
                    setAccessibilityStatus(event.currentTarget.value as MediaAccessibilityStatus)
                  }
                  value={accessibilityStatus}
                >
                  <option value="approved">Ready</option>
                  <option value="blocked">Needs work</option>
                </select>
              </label>
            </div>
            <label>
              What did you check?
              <textarea
                maxLength={2_000}
                onChange={(event) => setEvidence(event.currentTarget.value)}
                placeholder="Describe the playback, transcript, and accessibility checks you completed."
                required
                rows={4}
                value={evidence}
              />
            </label>
            <label className="confirmation-label">
              <input
                checked={confirmReview}
                onChange={(event) => setConfirmReview(event.currentTarget.checked)}
                type="checkbox"
              />
              I confirm this decision applies to the private audio I just verified and listened to.
            </label>
            <button
              aria-describedby={reviewDisabled ? "media-review-disabled" : undefined}
              className="primary-button"
              data-primary-action="true"
              disabled={reviewDisabled}
              type="submit"
            >
              {pending ? "Saving…" : "Save audio review"}
            </button>
            {reviewDisabled ? (
              <p className="permission-note" id="media-review-disabled">
                {pending
                  ? "Studio is saving this review. Wait for it to finish."
                  : "Add your evidence note and check the confirmation box before saving."}
              </p>
            ) : null}
          </form>
        </>
      ) : null}

      <details className="advanced-details">
        <summary>Advanced audio details</summary>
        {artifact ? <ArtifactIdentity artifact={artifact} /> : <p>No audio selected.</p>}
        {playback && playback.artifactId === artifactId ? (
          <p className="operation-detail">
            Verified {playback.byteCount} bytes · SHA-256 {playback.sha256}
          </p>
        ) : null}
        {reviews.map((review) => (
          <ReviewIdentity key={review.id} review={review} />
        ))}
      </details>
    </article>
  );
}

function StageReleaseAction({
  artifact,
  eligibleReviews,
  execute,
  flow,
  organizationId,
  pending,
  reviewId,
  setReviewId,
}: {
  readonly artifact: TenantMediaArtifactSummary | undefined;
  readonly eligibleReviews: readonly TenantMediaReviewSummary[];
  readonly execute: (
    key: string,
    success: string,
    failure: string,
    action: () => Promise<unknown>,
  ) => Promise<void>;
  readonly flow: MediaReleaseOperatorFlow;
  readonly organizationId: Uuid;
  readonly pending: boolean;
  readonly reviewId: string;
  readonly setReviewId: (value: string) => void;
}) {
  const [confirmStage, setConfirmStage] = useState(false);
  const review = eligibleReviews.find(({ id }) => id === reviewId);
  const disabled = !review || !artifact || !confirmStage || pending;

  return (
    <article className="authority-card">
      <label>
        Approved human review
        <select onChange={(event) => setReviewId(event.currentTarget.value)} value={reviewId}>
          {eligibleReviews.map((item, index) => (
            <option key={item.id} value={item.id}>
              Approved review {index + 1} · saved {formatDate(item.createdAt)}
            </option>
          ))}
        </select>
      </label>
      <label className="confirmation-label">
        <input
          checked={confirmStage}
          onChange={(event) => setConfirmStage(event.currentTarget.checked)}
          type="checkbox"
        />
        I confirm this approved audio can be placed in an immutable private release bundle. This
        does not publish.
      </label>
      <button
        aria-describedby={disabled ? "stage-release-disabled" : undefined}
        className="primary-button"
        data-primary-action="true"
        disabled={disabled}
        onClick={() => {
          if (!review || !artifact) {
            return;
          }
          void execute(
            "stage-release",
            "Private release staged. Nothing was published.",
            "The private release was not staged",
            () =>
              flow.stageRelease({
                configuration: {
                  release_channel: "private_acceptance",
                  source: "strongr_studio_m3_3",
                },
                correlationId: newUuid(),
                mediaArtifactId: artifact.id,
                mediaReviewId: review.id,
                organizationId,
                productionPackageId: artifact.productionPackageId,
              }),
          ).finally(() => setConfirmStage(false));
        }}
        type="button"
      >
        {pending ? "Staging…" : "Stage private release"}
      </button>
      {disabled ? (
        <p className="permission-note" id="stage-release-disabled">
          {pending
            ? "Studio is staging the private release. Wait for it to finish."
            : "Select the approved review and check the confirmation box before staging."}
        </p>
      ) : null}
      <details className="advanced-details">
        <summary>Advanced staging details</summary>
        <p className="operation-detail">
          Package {artifact?.productionPackageId ?? "unavailable"} · artifact{" "}
          {artifact?.id ?? "unavailable"} · review {review?.id ?? "unavailable"}
        </p>
        <p className="operation-detail">
          Review evidence {review ? shortHash(review.evidenceHash) : "unavailable"}
        </p>
      </details>
    </article>
  );
}

function RevocationManagement({
  aal2,
  allowed,
  execute,
  flow,
  organizationId,
  pending,
  revocationByBundle,
  workspace,
}: {
  readonly aal2: boolean;
  readonly allowed: boolean;
  readonly execute: (
    key: string,
    success: string,
    failure: string,
    action: () => Promise<unknown>,
  ) => Promise<void>;
  readonly flow: MediaReleaseOperatorFlow;
  readonly organizationId: Uuid;
  readonly pending: boolean;
  readonly revocationByBundle: ReadonlyMap<
    Uuid,
    MediaReleaseWorkspace["stagedRevocations"][number]
  >;
  readonly workspace: MediaReleaseWorkspace;
}) {
  const unrevokedBundles = workspace.stagedBundles.filter(({ id }) => !revocationByBundle.has(id));
  const [bundleId, setBundleId] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [reasonCode, setReasonCode] = useState("m3_3_release_withdrawn");

  useEffect(() => {
    setBundleId((current) =>
      unrevokedBundles.some(({ id }) => id === current) ? current : (unrevokedBundles[0]?.id ?? ""),
    );
  }, [unrevokedBundles]);

  const disabled = !aal2 || !allowed || !bundleId || !confirmRevoke || pending;
  let disabledReason = "";
  if (!allowed) {
    disabledReason =
      "Your role cannot withdraw a staged release. Ask an organization owner for the release revoke permission.";
  } else if (!aal2) {
    disabledReason = "Confirm your authenticator before withdrawing a private release.";
  } else if (pending) {
    disabledReason = "Studio is saving another action. Wait for it to finish.";
  } else if (!confirmRevoke) {
    disabledReason = "Check the confirmation box before withdrawing this release.";
  }

  return (
    <details className="advanced-details authority-management">
      <summary>Advanced: withdraw a private release</summary>
      <p>
        Use this only when an already staged private bundle must no longer be usable. The
        append-only audit history remains intact.
      </p>
      <label>
        Private release
        <select onChange={(event) => setBundleId(event.currentTarget.value)} value={bundleId}>
          {unrevokedBundles.map((item, index) => (
            <option key={item.id} value={item.id}>
              Private release {index + 1} · staged {formatDate(item.stagedAt)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Reason code
        <input
          maxLength={80}
          onChange={(event) => setReasonCode(event.currentTarget.value)}
          required
          value={reasonCode}
        />
      </label>
      <label className="confirmation-label">
        <input
          checked={confirmRevoke}
          onChange={(event) => setConfirmRevoke(event.currentTarget.checked)}
          type="checkbox"
        />
        I confirm this withdraws authority for the selected private release.
      </label>
      <button
        aria-describedby={disabled ? "revoke-release-disabled" : undefined}
        className="danger-button"
        disabled={disabled}
        onClick={() => {
          void execute(
            "revoke-staged-release",
            "Private release authority withdrawn. The audit record remains intact.",
            "The private release authority was not withdrawn",
            () =>
              flow.revokeStagedRelease({
                correlationId: newUuid(),
                organizationId,
                reasonCode,
                stagedReleaseBundleId: bundleId,
              }),
          ).finally(() => setConfirmRevoke(false));
        }}
        type="button"
      >
        {pending ? "Withdrawing…" : "Withdraw private release"}
      </button>
      {disabled ? (
        <p className="permission-note" id="revoke-release-disabled">
          {disabledReason}
        </p>
      ) : null}
      <details className="advanced-details">
        <summary>Exact release identities</summary>
        {unrevokedBundles.map((bundle) => (
          <p className="status-copy" key={bundle.id}>
            Bundle {bundle.id} · manifest {shortHash(bundle.manifestHash)}
          </p>
        ))}
      </details>
    </details>
  );
}

function TechnicalMediaDetails({
  jobs,
  reviews,
  stagedBundle,
  stagedRevocation,
}: {
  readonly jobs: MediaReleaseWorkspace["jobs"];
  readonly reviews: MediaReleaseWorkspace["reviews"];
  readonly stagedBundle: MediaReleaseWorkspace["stagedBundles"][number] | undefined;
  readonly stagedRevocation: MediaReleaseWorkspace["stagedRevocations"][number] | undefined;
}) {
  return (
    <>
      {jobs.length === 0 ? <p className="status-copy">No media job for this package.</p> : null}
      {jobs.map((job) => (
        <p className="status-copy" key={job.id}>
          Job {job.id} · {job.state} · attempt {job.attemptCount}/{job.maxAttempts}
          {job.lastErrorCode ? ` · ${job.lastErrorCode}` : ""}
        </p>
      ))}
      {reviews.map((review) => (
        <ReviewIdentity key={review.id} review={review} />
      ))}
      {stagedBundle ? (
        <p className="status-copy">
          Bundle {stagedBundle.id} · manifest {shortHash(stagedBundle.manifestHash)} ·{" "}
          {stagedRevocation
            ? `revoked ${formatDate(stagedRevocation.revokedAt)}`
            : "staged, not published"}
        </p>
      ) : null}
    </>
  );
}

function ArtifactIdentity({ artifact }: { readonly artifact: TenantMediaArtifactSummary }) {
  return (
    <dl className="evidence-list">
      <div>
        <dt>Exact identity</dt>
        <dd>{artifact.id}</dd>
      </div>
      <div>
        <dt>SHA-256</dt>
        <dd>{artifact.sha256}</dd>
      </div>
      <div>
        <dt>Validated bytes</dt>
        <dd>{artifact.byteCount}</dd>
      </div>
      <div>
        <dt>Validated</dt>
        <dd>{formatDate(artifact.validatedAt)}</dd>
      </div>
    </dl>
  );
}

function ReviewIdentity({ review }: { readonly review: TenantMediaReviewSummary }) {
  return (
    <p className="status-copy">
      Review {review.id} · {review.decision} · transcript {review.transcriptStatus} · accessibility{" "}
      {review.accessibilityStatus} · evidence {shortHash(review.evidenceHash)}
    </p>
  );
}
