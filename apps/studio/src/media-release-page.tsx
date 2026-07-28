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

interface VerifiedPlayback {
  readonly artifactId: Uuid;
  readonly byteCount: number;
  readonly sha256: string;
  readonly url: string;
}

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
      reportWorkflowFailure(error, "The governed media workspace could not be loaded");
      setWorkspace({
        message: "Canonical media and release state could not be loaded. No success is assumed.",
        status: "error",
      });
    }
  }, [activeOrganization, flow, reportWorkflowFailure]);

  useEffect(() => {
    closePlayback();
    void refresh();
  }, [closePlayback, refresh]);

  const execute = useCallback(
    async (key: string, success: string, failure: string, action: () => Promise<unknown>) => {
      if (mutationLock.current) {
        return;
      }
      mutationLock.current = true;
      setPending(key);
      try {
        await action();
        announce(success);
      } catch (error) {
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
        <p className="eyebrow">Governed media · {activeOrganization.name}</p>
        <h1>Private audio through revocable release staging.</h1>
        <p>
          Every action uses a narrow governed command or an exact authenticated object read. Staging
          creates an immutable, non-public manifest; it does not publish.
        </p>
      </div>

      <section className="workflow-safety" aria-label="Current media workflow safety">
        <div>
          <strong>{aal2 ? "AAL2 session" : "AAL2 not confirmed"}</strong>
          <p>
            Media request, release staging, and release revocation require AAL2 inside the database
            transaction. Playback bytes are verified before an in-memory URL is created.
          </p>
        </div>
        {!aal2 ? (
          <Link className="button-link" to="/security">
            Open session security
          </Link>
        ) : null}
        <button
          className="secondary-button"
          disabled={workspace.status === "loading" || pending !== null}
          onClick={() => void refresh()}
          type="button"
        >
          Reload canonical state
        </button>
      </section>

      {workspace.status === "loading" ? (
        <p role="status">Loading canonical packages, media, reviews, and staged releases…</p>
      ) : null}
      {workspace.status === "error" ? <p role="alert">{workspace.message}</p> : null}
      {workspace.status === "ready" ? (
        <div className="content-workspace">
          <MediaRequestCard
            aal2={aal2}
            allowed={permission("media.request")}
            execute={execute}
            flow={flow}
            organizationId={activeOrganization.id}
            pending={pending !== null}
            workspace={workspace.value}
          />
          <ArtifactCard
            allowed={permission("media.review")}
            closePlayback={closePlayback}
            execute={execute}
            flow={flow}
            organizationId={activeOrganization.id}
            pending={pending !== null}
            playback={playback}
            reportWorkflowFailure={reportWorkflowFailure}
            setPending={setPending}
            setPlayback={setPlayback}
            workspace={workspace.value}
          />
          <ReleaseCard
            aal2={aal2}
            canRevoke={permission("release.revoke")}
            canStage={permission("release.stage")}
            execute={execute}
            flow={flow}
            organizationId={activeOrganization.id}
            pending={pending !== null}
            workspace={workspace.value}
          />
        </div>
      ) : null}
    </>
  );
}

function MediaRequestCard({
  aal2,
  allowed,
  execute,
  flow,
  organizationId,
  pending,
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
  readonly workspace: MediaReleaseWorkspace;
}) {
  const revokedApprovals = new Set(
    workspace.approvalRevocations.map(({ approvalSnapshotId }) => approvalSnapshotId),
  );
  const packages = workspace.productionPackages.filter(
    ({ approvalSnapshotId }) => !revokedApprovals.has(approvalSnapshotId),
  );
  const [packageId, setPackageId] = useState("");
  const [outputSpecId, setOutputSpecId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    setPackageId(packages[0]?.id ?? "");
    setOutputSpecId(workspace.outputSpecs[0]?.id ?? "");
  }, [packages[0]?.id, workspace.outputSpecs[0]?.id]);

  const selectedSpec = workspace.outputSpecs.find(({ id }) => id === outputSpecId);
  const jobs = workspace.jobs.filter(
    ({ productionPackageId }) => productionPackageId === packageId,
  );

  return (
    <section className="workflow-section" aria-labelledby="media-request-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Step 1 · AAL2</p>
          <h2 id="media-request-heading">Request deterministic private audio</h2>
        </div>
        <span className="status-pill status-pill--neutral">{jobs.length} jobs</span>
      </div>
      <p>
        The request targets one immutable package and one allowlisted WAV specification. The stable
        idempotency key changes only after a confirmed success.
      </p>
      <label>
        Exact production package
        <select onChange={(event) => setPackageId(event.currentTarget.value)} value={packageId}>
          {packages.length === 0 ? <option value="">No unrevoked package</option> : null}
          {packages.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} · {shortHash(item.manifestHash)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Allowlisted output specification
        <select
          onChange={(event) => setOutputSpecId(event.currentTarget.value)}
          value={outputSpecId}
        >
          {workspace.outputSpecs.length === 0 ? (
            <option value="">No output specification</option>
          ) : null}
          {workspace.outputSpecs.map((spec) => (
            <option key={spec.id} value={spec.id}>
              {spec.key} v{spec.version} · {spec.sampleRateHz} Hz mono {spec.container}
            </option>
          ))}
        </select>
      </label>
      {selectedSpec ? (
        <p className="operation-detail">
          audio/wav · PCM 16-bit mono · maximum {Math.round(selectedSpec.maxDurationMs / 60_000)}{" "}
          minutes · spec {shortHash(selectedSpec.specHash)}
        </p>
      ) : null}
      <p className="operation-detail">
        Stable request key: <code>{idempotencyKey}</code>
      </p>
      <label className="confirmation-label">
        <input
          checked={confirm}
          onChange={(event) => setConfirm(event.currentTarget.checked)}
          type="checkbox"
        />
        I confirm the exact package and output specification. This creates durable work only; it
        does not publish.
      </label>
      <button
        className="primary-button"
        disabled={!aal2 || !allowed || !packageId || !outputSpecId || !confirm || pending}
        onClick={() => {
          void execute(
            "request-media",
            "Media request accepted. Canonical job state was reloaded.",
            "The media request was not confirmed",
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
        Request exact media
      </button>
      {jobs.map((job) => (
        <p className="status-copy" key={job.id}>
          Job {job.id} · {job.state} · attempt {job.attemptCount}/{job.maxAttempts}
          {job.lastErrorCode ? ` · ${job.lastErrorCode}` : ""}
        </p>
      ))}
    </section>
  );
}

function ArtifactCard({
  allowed,
  closePlayback,
  execute,
  flow,
  organizationId,
  pending,
  playback,
  reportWorkflowFailure,
  setPending,
  setPlayback,
  workspace,
}: {
  readonly allowed: boolean;
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
  readonly reportWorkflowFailure: (error: unknown, fallback: string) => void;
  readonly setPending: (value: string | null) => void;
  readonly setPlayback: (value: VerifiedPlayback | null) => void;
  readonly workspace: MediaReleaseWorkspace;
}) {
  const [artifactId, setArtifactId] = useState("");
  const [decision, setDecision] = useState<MediaReviewDecision>("approved");
  const [transcriptStatus, setTranscriptStatus] = useState<MediaTranscriptStatus>("ready");
  const [accessibilityStatus, setAccessibilityStatus] =
    useState<MediaAccessibilityStatus>("approved");
  const [evidence, setEvidence] = useState(
    "Synthetic transcript reviewed against the exact checksum-verified audio artifact.",
  );
  const [confirmReview, setConfirmReview] = useState(false);

  useEffect(() => {
    setArtifactId(workspace.artifacts[0]?.id ?? "");
  }, [workspace.artifacts[0]?.id]);
  useEffect(() => {
    if (playback && playback.artifactId !== artifactId) {
      closePlayback();
    }
  }, [artifactId, closePlayback, playback]);

  const artifact = workspace.artifacts.find(({ id }) => id === artifactId);
  const reviews = workspace.reviews.filter(({ mediaArtifactId }) => mediaArtifactId === artifactId);

  const verify = async () => {
    if (!artifact || pending) {
      return;
    }
    closePlayback();
    setPending("verify-artifact");
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
    } catch (error) {
      reportWorkflowFailure(error, "The private artifact was not verified for playback");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="workflow-section" aria-labelledby="artifact-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Steps 2–3</p>
          <h2 id="artifact-heading">Verify playback and record human review</h2>
        </div>
        <span className="status-pill status-pill--neutral">
          {workspace.artifacts.length} artifacts
        </span>
      </div>
      <label>
        Exact validated artifact
        <select onChange={(event) => setArtifactId(event.currentTarget.value)} value={artifactId}>
          {workspace.artifacts.length === 0 ? (
            <option value="">No validated artifact</option>
          ) : null}
          {workspace.artifacts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} · {Math.round(item.durationMs / 1_000)} seconds · {shortHash(item.sha256)}
            </option>
          ))}
        </select>
      </label>
      {artifact ? <ArtifactIdentity artifact={artifact} /> : null}
      <button
        className="secondary-button"
        disabled={!artifact || pending}
        onClick={() => void verify()}
        type="button"
      >
        Verify private artifact
      </button>
      {playback && playback.artifactId === artifactId ? (
        <div className="confirmation-panel">
          <p role="status">
            Verified {playback.byteCount} bytes and SHA-256 {playback.sha256}. The object URL exists
            only in memory and is revoked when playback ends, closes, or changes.
          </p>
          {/* biome-ignore lint/a11y/useMediaCaption: This review surface presents adjacent governed transcript evidence; it does not publish media. */}
          <audio controls onEnded={closePlayback} preload="metadata" src={playback.url}>
            Your browser does not support audio playback.
          </audio>
          <button className="text-button" onClick={closePlayback} type="button">
            Close verified playback
          </button>
        </div>
      ) : null}

      <form
        className="workflow-form"
        onSubmit={submit(() =>
          execute(
            "record-media-review",
            "Media review recorded. Canonical review evidence was reloaded.",
            "The media review was not confirmed",
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
            Human decision
            <select
              onChange={(event) => setDecision(event.currentTarget.value as MediaReviewDecision)}
              value={decision}
            >
              <option value="approved">Approved</option>
              <option value="changes_requested">Changes requested</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label>
            Transcript status
            <select
              onChange={(event) =>
                setTranscriptStatus(event.currentTarget.value as MediaTranscriptStatus)
              }
              value={transcriptStatus}
            >
              <option value="ready">Ready</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label>
            Accessibility status
            <select
              onChange={(event) =>
                setAccessibilityStatus(event.currentTarget.value as MediaAccessibilityStatus)
              }
              value={accessibilityStatus}
            >
              <option value="approved">Approved</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
        </div>
        <label>
          Transcript and accessibility evidence
          <textarea
            maxLength={2_000}
            onChange={(event) => setEvidence(event.currentTarget.value)}
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
          I confirm this human decision targets artifact {artifactId || "not selected"} and checksum{" "}
          {artifact ? shortHash(artifact.sha256) : "unavailable"}.
        </label>
        <button
          className="primary-button"
          disabled={
            !allowed || !artifactId || evidence.trim().length === 0 || !confirmReview || pending
          }
          type="submit"
        >
          Record exact media review
        </button>
      </form>
      {reviews.map((review) => (
        <ReviewIdentity key={review.id} review={review} />
      ))}
    </section>
  );
}

function ReleaseCard({
  aal2,
  canRevoke,
  canStage,
  execute,
  flow,
  organizationId,
  pending,
  workspace,
}: {
  readonly aal2: boolean;
  readonly canRevoke: boolean;
  readonly canStage: boolean;
  readonly execute: (
    key: string,
    success: string,
    failure: string,
    action: () => Promise<unknown>,
  ) => Promise<void>;
  readonly flow: MediaReleaseOperatorFlow;
  readonly organizationId: Uuid;
  readonly pending: boolean;
  readonly workspace: MediaReleaseWorkspace;
}) {
  const eligibleReviews = workspace.reviews.filter(
    ({ accessibilityStatus, decision, transcriptStatus }) =>
      decision === "approved" && transcriptStatus === "ready" && accessibilityStatus === "approved",
  );
  const [reviewId, setReviewId] = useState("");
  const [bundleId, setBundleId] = useState("");
  const [confirmStage, setConfirmStage] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [reasonCode, setReasonCode] = useState("m3_3_release_withdrawn");

  const review = eligibleReviews.find(({ id }) => id === reviewId);
  const artifact = workspace.artifacts.find(({ id }) => id === review?.mediaArtifactId);
  const packageId = artifact?.productionPackageId ?? "";
  const revocationByBundle = new Map(
    workspace.stagedRevocations.map((item) => [item.stagedReleaseBundleId, item]),
  );
  const unrevokedBundles = workspace.stagedBundles.filter(({ id }) => !revocationByBundle.has(id));
  const existingBundle = workspace.stagedBundles.find(
    (item) =>
      item.productionPackageId === packageId &&
      item.mediaArtifactId === artifact?.id &&
      item.mediaReviewId === reviewId,
  );

  useEffect(() => {
    setReviewId(eligibleReviews[0]?.id ?? "");
    setBundleId(unrevokedBundles[0]?.id ?? "");
  }, [eligibleReviews[0]?.id, unrevokedBundles[0]?.id]);

  return (
    <section className="workflow-section" aria-labelledby="release-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Step 4 · AAL2</p>
          <h2 id="release-heading">Stage or revoke a non-public release bundle</h2>
        </div>
        <span className="status-pill status-pill--neutral">
          {workspace.stagedBundles.length} bundles
        </span>
      </div>
      <div className="authority-grid">
        <article className="authority-card">
          <h3>Stage exact approved media</h3>
          <label>
            Approved review
            <select onChange={(event) => setReviewId(event.currentTarget.value)} value={reviewId}>
              {eligibleReviews.length === 0 ? <option value="">No eligible review</option> : null}
              {eligibleReviews.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} · {shortHash(item.evidenceHash)}
                </option>
              ))}
            </select>
          </label>
          {review && artifact ? (
            <p className="operation-detail">
              Package {packageId}; artifact {artifact.id}; review {review.id}. Configuration is
              private staging only.
            </p>
          ) : null}
          {existingBundle ? (
            <p className="status-copy">
              Exact bundle already exists: {existingBundle.id} ·{" "}
              {shortHash(existingBundle.manifestHash)}.
            </p>
          ) : null}
          <label className="confirmation-label">
            <input
              checked={confirmStage}
              onChange={(event) => setConfirmStage(event.currentTarget.checked)}
              type="checkbox"
            />
            I confirm these exact package, artifact, and review identities. This stages an immutable
            private manifest and does not publish.
          </label>
          <button
            className="primary-button"
            disabled={
              !aal2 ||
              !canStage ||
              !review ||
              !artifact ||
              Boolean(existingBundle) ||
              !confirmStage ||
              pending
            }
            onClick={() => {
              if (!review || !artifact) {
                return;
              }
              void execute(
                "stage-release",
                "Immutable release bundle staged. No publication occurred.",
                "The release bundle was not confirmed as staged",
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
            Stage exact release bundle
          </button>
        </article>

        <article className="authority-card authority-card--danger">
          <h3>Revoke staged authority</h3>
          <label>
            Unrevoked staged bundle
            <select onChange={(event) => setBundleId(event.currentTarget.value)} value={bundleId}>
              {unrevokedBundles.length === 0 ? <option value="">No unrevoked bundle</option> : null}
              {unrevokedBundles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id} · {shortHash(item.manifestHash)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Machine reason code
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
            I confirm this append-only revocation targets the exact staged bundle.
          </label>
          <button
            className="danger-button"
            disabled={!aal2 || !canRevoke || !bundleId || !confirmRevoke || pending}
            onClick={() => {
              void execute(
                "revoke-staged-release",
                "Staged release authority revoked. Canonical state was reloaded.",
                "The staged release was not confirmed as revoked",
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
            Revoke exact staged bundle
          </button>
        </article>
      </div>

      {workspace.stagedBundles.map((bundle) => {
        const revocation = revocationByBundle.get(bundle.id);
        return (
          <p className="status-copy" key={bundle.id}>
            Bundle {bundle.id} · {shortHash(bundle.manifestHash)} ·{" "}
            {revocation ? `revoked ${formatDate(revocation.revokedAt)}` : "staged, not published"}
          </p>
        );
      })}
    </section>
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
