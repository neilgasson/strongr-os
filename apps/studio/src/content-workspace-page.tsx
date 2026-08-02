import {
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";

import type {
  AudioReflection,
  StrongrDailyAudioReflectionV2,
  StrongrDailyAudioReflectionV2Brief,
} from "../../../packages/content-schemas/src/index.ts";
import {
  parseAudioReflection,
  parseStrongrDailyAudioReflectionV2,
} from "../../../packages/content-schemas/src/index.ts";
import type {
  ReviewDecision,
  ReviewLane,
  TenantApprovalSnapshotSummary,
  TenantBriefSummary,
  TenantContentVersionSummary,
  TenantProductionPackageSummary,
  Uuid,
} from "../../../packages/contracts/src/index.ts";

import {
  BriefToDraftOperatorFlow,
  type BriefToDraftWorkspace,
  GenerationRequestDeferredError,
  GenerationRuntimeDeferredError,
} from "./brief-to-draft-flow.ts";
import {
  contentProfileGateForBinding,
  contentProfileGateForOption,
  findStudioContentProfileOption,
  studioContentProfileOptions,
  type StudioContentProfileOption,
} from "./content-profile-foundation.ts";
import {
  ReviewToPackageOperatorFlow,
  type ReviewToPackageWorkspace,
} from "./review-to-package-flow.ts";
import { useStudioSession } from "./session-context.tsx";
import { createStrongrDailyApprovedExport } from "./strongr-daily-export.ts";

interface ContentWorkspace {
  readonly draft: BriefToDraftWorkspace;
  readonly review: ReviewToPackageWorkspace;
}

type WorkspaceState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ message: string; status: "error" }>
  | Readonly<{ status: "ready"; value: ContentWorkspace }>;

type WorkflowNotice = Readonly<{
  kind: "error" | "success";
  message: string;
}>;

type ExecuteMutation = (
  key: string,
  success: string,
  failure: string,
  action: () => Promise<unknown>,
) => Promise<void>;

type RefreshWorkspace = (options?: Readonly<{ silent?: boolean }>) => Promise<void>;

const initialScriptureReference = Object.freeze({
  reference: "",
  source_citation: "",
  translation: "",
});

const initialBrief: StrongrDailyAudioReflectionV2Brief = Object.freeze({
  audience: "",
  content_type: "audio_reflection",
  desired_duration_seconds: 300,
  pastoral_purpose: "",
  prohibited_claims_or_wording: ["Do not promise outcomes that Scripture does not promise."],
  required_elements: ["Scripture reflection", "Prayer", "Personal takeaway"],
  schema_id: "strongr.strongr_daily_audio_reflection_brief.v2",
  scripture_reference: initialScriptureReference,
  source_brief_identifier: "",
  theme: "",
  tone: "pastoral",
  working_title: "",
});

function newUuid(): Uuid {
  return globalThis.crypto.randomUUID();
}

function newIdempotencyKey(): string {
  return `strongr-daily-v2-${newUuid()}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown time" : date.toLocaleString();
}

function shortHash(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function lines(value: string, maximum: number): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, maximum);
}

type ImmutableContent = AudioReflection | StrongrDailyAudioReflectionV2;

function reflectionFromVersion(
  version: TenantContentVersionSummary | undefined,
): ImmutableContent | null {
  if (!version) {
    return null;
  }
  try {
    if (version.schemaId === "strongr.strongr_daily_audio_reflection.v2") {
      return parseStrongrDailyAudioReflectionV2(version.payload);
    }
    return parseAudioReflection(version.payload);
  } catch {
    return null;
  }
}

function isStrongrDailyV2(value: ImmutableContent): value is StrongrDailyAudioReflectionV2 {
  return value.schema_id === "strongr.strongr_daily_audio_reflection.v2";
}

function contentTitle(value: ImmutableContent): string {
  return isStrongrDailyV2(value) ? value.final_title : value.title;
}

function versionStateLabel(state: TenantContentVersionSummary["state"]): string {
  if (state === "submitted") {
    return "Submitted for review";
  }
  if (state === "superseded") {
    return "Replaced";
  }
  return "Draft";
}

function versionSourceLabel(source: TenantContentVersionSummary["source"]): string {
  return source === "ai_assisted" ? "AI-assisted" : "Written manually";
}

export function ContentWorkspacePage() {
  const { activeOrganization, announce, capabilities, foundation, mfa, reportWorkflowFailure } =
    useStudioSession();
  const [workspace, setWorkspace] = useState<WorkspaceState>({ status: "loading" });
  const [selectedBriefId, setSelectedBriefId] = useState<Uuid | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<Uuid | null>(null);
  const [creatingAnotherBrief, setCreatingAnotherBrief] = useState(false);
  const [pendingMutation, setPendingMutation] = useState<string | null>(null);
  const [workflowNotice, setWorkflowNotice] = useState<WorkflowNotice | null>(null);
  const mutationLock = useRef(false);
  const draftFlow = useMemo(
    () => (foundation ? new BriefToDraftOperatorFlow(foundation) : null),
    [foundation],
  );
  const reviewFlow = useMemo(
    () => (foundation ? new ReviewToPackageOperatorFlow(foundation) : null),
    [foundation],
  );

  const refresh: RefreshWorkspace = useCallback(
    async (options) => {
      if (!activeOrganization || !draftFlow || !reviewFlow) {
        return;
      }
      if (!options?.silent) {
        setWorkspace({ status: "loading" });
      }
      try {
        const [draft, review] = await Promise.all([
          draftFlow.loadWorkspace(activeOrganization.id),
          reviewFlow.loadWorkspace(activeOrganization.id),
        ]);
        setWorkspace({ status: "ready", value: Object.freeze({ draft, review }) });
      } catch (error) {
        reportWorkflowFailure(error, "The content screen could not be loaded");
        if (!options?.silent) {
          setWorkspace({
            message: "Your saved work could not be loaded. No action was taken.",
            status: "error",
          });
        }
      }
    },
    [activeOrganization, draftFlow, reportWorkflowFailure, reviewFlow],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (workspace.status !== "ready") {
      return;
    }
    const briefs = [...workspace.value.draft.briefs].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
    if (briefs.some(({ id }) => id === selectedBriefId)) {
      return;
    }
    setSelectedBriefId(briefs[0]?.id ?? null);
  }, [selectedBriefId, workspace]);

  useEffect(() => {
    if (workspace.status !== "ready" || !selectedBriefId) {
      return;
    }
    const jobs = workspace.value.draft.generationJobs
      .filter(({ briefId }) => briefId === selectedBriefId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    const versions = workspace.value.draft.versions.filter(
      ({ briefId }) => briefId === selectedBriefId,
    );
    const generatedVersion = versions.find(({ sourceJobId }) => sourceJobId === jobs[0]?.id);
    if (jobs[0]?.state === "succeeded" && generatedVersion) {
      if (selectedVersionId !== generatedVersion.id) {
        setSelectedVersionId(generatedVersion.id);
      }
      return;
    }
    if (versions.some(({ id }) => id === selectedVersionId)) {
      return;
    }
    setSelectedVersionId(versions[0]?.id ?? null);
  }, [selectedBriefId, selectedVersionId, workspace]);

  const execute: ExecuteMutation = useCallback(
    async (key, success, failure, action) => {
      if (mutationLock.current) {
        return;
      }
      mutationLock.current = true;
      setPendingMutation(key);
      try {
        await action();
        announce(success);
        setWorkflowNotice({ kind: "success", message: success });
      } catch (error) {
        if (error instanceof GenerationRequestDeferredError) {
          const message =
            "The brief was saved, but generation did not start. Nothing was approved or published. Refresh the status before trying again.";
          announce(message);
          setWorkflowNotice({ kind: "error", message });
        } else if (error instanceof GenerationRuntimeDeferredError) {
          const message =
            "The draft request is saved, but the private generator did not finish. Nothing was approved or published. Use Try generation again when you are ready.";
          announce(message);
          setWorkflowNotice({ kind: "error", message });
        } else {
          reportWorkflowFailure(error, failure);
          setWorkflowNotice({
            kind: "error",
            message: `${failure}. Nothing was approved or published. The current step is still open; review it and try again.`,
          });
        }
      } finally {
        await refresh();
        mutationLock.current = false;
        setPendingMutation(null);
      }
    },
    [announce, refresh, reportWorkflowFailure],
  );

  if (!activeOrganization || !draftFlow || !reviewFlow) {
    return null;
  }

  const selectedVersion =
    workspace.status === "ready"
      ? workspace.value.draft.versions.find(
          ({ briefId, id }) => briefId === selectedBriefId && id === selectedVersionId,
        )
      : undefined;
  const aal2 = mfa.status === "ready" && mfa.value.currentLevel === "aal2";

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Content workflow · {activeOrganization.name}</p>
        <h1>Finish one clear step at a time.</h1>
        <p>
          Studio shows what is finished, what needs attention now, and what comes next. Sensitive
          actions remain protected even though the normal workflow stays simple.
        </p>
      </div>

      <section
        className="workflow-safety"
        id="session-security"
        aria-label="Current workflow safety"
      >
        <div>
          <strong>
            {aal2 ? "Secure session confirmed" : "Extra confirmation may be required"}
          </strong>
          <p>
            {aal2
              ? "You can complete sensitive review and approval steps during this session."
              : "Studio will tell you when to enter the current six-digit code from your authenticator."}
          </p>
          <details className="advanced-details">
            <summary>Advanced security details</summary>
            <p>
              {aal2
                ? "This session has AAL2 assurance. Every sensitive command still rechecks assurance, membership, tenant, and permission."
                : "This session has not confirmed AAL2 assurance. The database will reject sensitive commands until step-up succeeds."}
            </p>
          </details>
        </div>
        <div>
          <button
            aria-describedby={
              workspace.status === "loading" || pendingMutation !== null
                ? "refresh-work-reason"
                : undefined
            }
            className="secondary-button"
            disabled={workspace.status === "loading" || pendingMutation !== null}
            onClick={() => void refresh()}
            type="button"
          >
            Refresh saved work
          </button>
          {workspace.status === "loading" || pendingMutation !== null ? (
            <p className="permission-note" id="refresh-work-reason">
              Studio is already updating this screen.
            </p>
          ) : null}
        </div>
      </section>

      {workspace.status === "loading" ? <p role="status">Loading your saved work…</p> : null}
      {workspace.status === "error" ? (
        <section className="workflow-recovery" role="alert">
          <h2>Studio could not load this work</h2>
          <p>No changes were made. Check your connection, then try loading the saved work again.</p>
          <button className="primary-button" onClick={() => void refresh()} type="button">
            Try loading again
          </button>
        </section>
      ) : null}
      {workspace.status === "ready" ? (
        <div className="content-workspace">
          {workflowNotice ? (
            <div
              className={`workflow-notice workflow-notice--${workflowNotice.kind}`}
              role={workflowNotice.kind === "error" ? "alert" : "status"}
            >
              <strong>
                {workflowNotice.kind === "success" ? "Step completed" : "Step not saved"}
              </strong>
              <p>{workflowNotice.message}</p>
              <button className="text-button" onClick={() => setWorkflowNotice(null)} type="button">
                Dismiss
              </button>
            </div>
          ) : null}
          {workspace.value.draft.briefs.length === 0 || creatingAnotherBrief ? (
            <BriefComposer
              canCreate={capabilities.status === "ready" && capabilities.value["content.create"]}
              canCancel={workspace.value.draft.briefs.length > 0}
              execute={execute}
              flow={draftFlow}
              onBriefCreated={(briefId) => {
                setSelectedBriefId(briefId);
                setSelectedVersionId(null);
                setCreatingAnotherBrief(false);
              }}
              onCancel={() => setCreatingAnotherBrief(false)}
              organizationId={activeOrganization.id}
              pending={pendingMutation !== null}
            />
          ) : (
            (() => {
              const briefs = [...workspace.value.draft.briefs].sort(
                (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
              );
              const selectedBrief = briefs.find(({ id }) => id === selectedBriefId) ?? briefs[0];
              if (!selectedBrief) {
                return null;
              }
              const generationJobs = workspace.value.draft.generationJobs
                .filter(({ briefId }) => briefId === selectedBrief.id)
                .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
              const versions = workspace.value.draft.versions.filter(
                ({ briefId }) => briefId === selectedBrief.id,
              );
              // A later failed or in-progress regeneration must never hide an
              // earlier immutable draft. Generation status owns the screen only
              // until the first draft exists; after that, the draft workspace
              // remains the safe recovery path.
              const showGenerationStep = versions.length === 0;
              return (
                <>
                  <BriefChooser
                    briefs={briefs}
                    canCreate={
                      capabilities.status === "ready" && capabilities.value["content.create"]
                    }
                    onCreate={() => setCreatingAnotherBrief(true)}
                    onSelect={(briefId) => {
                      setSelectedBriefId(briefId);
                      setSelectedVersionId(null);
                    }}
                    pending={pendingMutation !== null}
                    selectedBriefId={selectedBrief.id}
                  />
                  {showGenerationStep ? (
                    <GenerationStatus
                      brief={selectedBrief}
                      canCreate={
                        capabilities.status === "ready" && capabilities.value["content.create"]
                      }
                      execute={execute}
                      flow={draftFlow}
                      generationJobs={generationJobs}
                      hasEarlierDraft={versions.length > 0}
                      organizationId={activeOrganization.id}
                      pending={pendingMutation !== null}
                      refresh={refresh}
                    />
                  ) : (
                    <>
                      <VersionWorkspace
                        canCreate={
                          capabilities.status === "ready" && capabilities.value["content.create"]
                        }
                        canSubmit={
                          capabilities.status === "ready" && capabilities.value["content.submit"]
                        }
                        execute={execute}
                        flow={draftFlow}
                        key={selectedVersion?.id ?? "no-version"}
                        organizationId={activeOrganization.id}
                        pending={pendingMutation !== null}
                        selectedVersion={selectedVersion}
                        selectVersion={setSelectedVersionId}
                        versions={versions}
                      />
                      <ReviewWorkspace
                        aal2={aal2}
                        capabilities={capabilities.status === "ready" ? capabilities.value : null}
                        execute={execute}
                        flow={reviewFlow}
                        organizationId={activeOrganization.id}
                        pending={pendingMutation !== null}
                        refresh={refresh}
                        selectedVersion={selectedVersion}
                        workspace={workspace.value.review}
                      />
                    </>
                  )}
                </>
              );
            })()
          )}
        </div>
      ) : null}
    </>
  );
}

function BriefChooser({
  briefs,
  canCreate,
  onCreate,
  onSelect,
  pending,
  selectedBriefId,
}: {
  readonly briefs: readonly TenantBriefSummary[];
  readonly canCreate: boolean;
  readonly onCreate: () => void;
  readonly onSelect: (briefId: Uuid) => void;
  readonly pending: boolean;
  readonly selectedBriefId: Uuid;
}) {
  return (
    <section className="workflow-selector" aria-labelledby="brief-selector-heading">
      <div>
        <p className="eyebrow">Saved reflection</p>
        <h2 id="brief-selector-heading">Choose the brief you want to finish</h2>
      </div>
      <label>
        Brief
        <select
          disabled={pending}
          onChange={(event) => onSelect(event.currentTarget.value)}
          value={selectedBriefId}
        >
          {briefs.map((brief, index) => (
            <option key={brief.id} value={brief.id}>
              Brief {briefs.length - index} · saved {formatDate(brief.createdAt)}
            </option>
          ))}
        </select>
      </label>
      <button
        aria-describedby={!canCreate ? "new-brief-reason" : undefined}
        className="secondary-button"
        disabled={!canCreate || pending}
        onClick={onCreate}
        type="button"
      >
        Start a new reflection
      </button>
      {!canCreate ? (
        <p className="permission-note" id="new-brief-reason">
          Your current role cannot create content. Ask an organization owner for content-creation
          access.
        </p>
      ) : null}
    </section>
  );
}

const GENERATION_POLL_LIMIT = 15;
const GENERATION_POLL_DELAY_MS = 2_000;

function generationFailureGuidance(errorCode: string | null): string {
  if (errorCode === "content_profile_not_active") {
    return "This content format is not active yet, so Studio stopped before contacting the provider. Your brief and any earlier draft are unchanged.";
  }
  if (errorCode === "generation.provider_invalid_response") {
    return "The provider returned a draft Studio could not safely validate. Your brief and any earlier draft are unchanged.";
  }
  if (errorCode === "generation.provider_cost_limit_exceeded") {
    return "The provider request was stopped by the cost limit. Your brief and any earlier draft are unchanged.";
  }
  if (errorCode === "generation.provider_timeout") {
    return "The provider did not finish in time. Your brief and any earlier draft are unchanged.";
  }
  if (errorCode === "generation.provider_rate_limited") {
    return "The provider is temporarily busy. Your brief and any earlier draft are unchanged.";
  }
  if (errorCode === "generation.provider_authentication_failed") {
    return "The private provider connection needs operator attention. Your brief and any earlier draft are unchanged.";
  }
  if (errorCode === "generation.provider_unavailable") {
    return "The provider is temporarily unavailable. Your brief and any earlier draft are unchanged.";
  }
  return "The provider did not create a usable draft. Your brief and any earlier draft are unchanged.";
}

function GenerationStatus({
  brief,
  canCreate,
  execute,
  flow,
  generationJobs,
  hasEarlierDraft,
  organizationId,
  pending,
  refresh,
}: {
  readonly brief: TenantBriefSummary;
  readonly canCreate: boolean;
  readonly execute: ExecuteMutation;
  readonly flow: BriefToDraftOperatorFlow;
  readonly generationJobs: BriefToDraftWorkspace["generationJobs"];
  readonly hasEarlierDraft: boolean;
  readonly organizationId: Uuid;
  readonly pending: boolean;
  readonly refresh: RefreshWorkspace;
}) {
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [pollingRequested, setPollingRequested] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [runtimeErrorCode, setRuntimeErrorCode] = useState<string | null>(null);
  const latestJob = generationJobs[0];
  const profileGate = contentProfileGateForBinding(brief.contentProfile);
  const active = latestJob?.state === "queued" || latestJob?.state === "running";
  const pollingFinished = pollingRequested && active && pollCount >= GENERATION_POLL_LIMIT;
  const failed =
    latestJob !== undefined && ["cancelled", "dead_letter", "failed"].includes(latestJob.state);
  const needsFreshRequest = failed || (latestJob?.state === "queued" && pollingFinished);

  useEffect(() => {
    if (!pollingRequested || !active || pollCount >= GENERATION_POLL_LIMIT) {
      return;
    }
    const timer = window.setTimeout(() => {
      setPollCount((value) => value + 1);
      void refresh({ silent: true });
    }, GENERATION_POLL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, pollCount, pollingRequested, refresh]);

  useEffect(() => {
    if (!active) {
      setPollingRequested(false);
      setPollCount(0);
    }
  }, [active]);

  const requestFreshGeneration = (retry: boolean) => {
    if (!profileGate.allowed) {
      return;
    }
    setRuntimeErrorCode(null);
    setPollCount(0);
    setPollingRequested(true);
    void execute(
      retry ? "retry-generation" : "request-generation",
      retry
        ? "A new private draft request was sent. Studio is checking its progress."
        : "The private draft request was sent. Studio is checking its progress.",
      retry ? "A new draft request was not completed" : "The draft request was not completed",
      async () => {
        try {
          const result = await flow.requestGeneration({
            briefId: brief.id,
            correlationId: newUuid(),
            idempotencyKey: newIdempotencyKey(),
            organizationId,
            promptKey: "strongr.strongr_daily.v2",
            promptVersion: 1,
          });
          setRuntimeErrorCode(result.errorCode);
        } catch (error) {
          if (error instanceof GenerationRuntimeDeferredError) {
            setRuntimeErrorCode(error.errorCode);
          }
          throw error;
        } finally {
          setConfirmRetry(false);
        }
      },
    );
  };

  if (!latestJob) {
    return (
      <section
        className="workflow-current-action"
        aria-label="Current step"
        aria-labelledby="generation-status-heading"
      >
        <p className="eyebrow">Step 2 · Current step</p>
        <h2 id="generation-status-heading">Generate the first private draft</h2>
        <p>
          This starts only when you choose the button below. The provider can create an unapproved
          draft only; it cannot approve, publish, narrate, upload, or release anything.
        </p>
        <p>
          Each generation is separately billable and protected by a hard maximum of US$0.10.
          Refreshing or reopening Studio never starts a generation.
        </p>
        <button
          aria-describedby={
            !profileGate.allowed || !canCreate || pending ? "generation-start-reason" : undefined
          }
          className="primary-button"
          data-primary-action
          disabled={!profileGate.allowed || !canCreate || pending}
          onClick={() => requestFreshGeneration(false)}
          type="button"
        >
          Generate first draft
        </button>
        {!profileGate.allowed ? (
          <p className="permission-note" id="generation-start-reason">
            {profileGate.reason}
          </p>
        ) : !canCreate ? (
          <p className="permission-note" id="generation-start-reason">
            Your current role cannot request a draft. Ask an organization owner for content-creation
            access.
          </p>
        ) : pending ? (
          <p className="permission-note" id="generation-start-reason">
            Studio is already completing this step.
          </p>
        ) : null}
      </section>
    );
  }

  if (needsFreshRequest) {
    return (
      <section
        className="workflow-current-action workflow-current-action--blocked"
        aria-label="Current step"
        aria-labelledby="generation-status-heading"
      >
        <p className="eyebrow">Step 2 · Needs attention</p>
        <h2 id="generation-status-heading">The draft was not completed</h2>
        <p>{generationFailureGuidance(runtimeErrorCode)}</p>
        {hasEarlierDraft ? (
          <p>Your earlier immutable draft is still available and was not changed.</p>
        ) : null}
        <p>
          Trying again creates a new provider request. It is separately billable and protected by
          the same US$0.10 hard maximum. Nothing starts until you confirm and choose the button.
        </p>
        <label className="generation-retry-confirmation">
          <input
            checked={confirmRetry}
            disabled={!profileGate.allowed}
            onChange={(event) => setConfirmRetry(event.currentTarget.checked)}
            type="checkbox"
          />
          I understand this intentionally starts one new, separately billable draft request.
        </label>
        <button
          aria-describedby={
            !profileGate.allowed || !canCreate || !confirmRetry || pending
              ? "generation-retry-reason"
              : undefined
          }
          className="primary-button"
          data-primary-action
          disabled={!profileGate.allowed || !canCreate || !confirmRetry || pending}
          onClick={() => requestFreshGeneration(true)}
          type="button"
        >
          Try generation again
        </button>
        {!profileGate.allowed ? (
          <p className="permission-note" id="generation-retry-reason">
            {profileGate.reason}
          </p>
        ) : !canCreate ? (
          <p className="permission-note" id="generation-retry-reason">
            Your current role cannot request another draft.
          </p>
        ) : !confirmRetry ? (
          <p className="permission-note" id="generation-retry-reason">
            Check the confirmation box to unlock a new provider request.
          </p>
        ) : pending ? (
          <p className="permission-note" id="generation-retry-reason">
            Studio is sending the new request now.
          </p>
        ) : null}
        <details className="advanced-details">
          <summary>Advanced generation details</summary>
          <p>
            Last job state: <code>{latestJob.state}</code>. Attempts: {latestJob.attemptCount}.
          </p>
        </details>
      </section>
    );
  }

  if (latestJob.state === "succeeded") {
    return (
      <section
        className="workflow-current-action"
        aria-label="Current step"
        aria-labelledby="generation-status-heading"
      >
        <p className="eyebrow">Step 2 · Draft generated</p>
        <h2 id="generation-status-heading">Load the saved private draft</h2>
        <p>
          Generation finished. Loading the saved draft does not contact the provider or create a
          charge.
        </p>
        <button
          className="primary-button"
          data-primary-action
          disabled={pending}
          onClick={() => void refresh()}
          type="button"
        >
          Load draft
        </button>
      </section>
    );
  }

  return (
    <section
      className="workflow-current-action"
      aria-label="Current step"
      aria-labelledby="generation-status-heading"
    >
      <p className="eyebrow">Step 2 · In progress</p>
      <h2 id="generation-status-heading">
        {latestJob.state === "running" ? "Studio is generating the draft" : "Draft request queued"}
      </h2>
      <p>
        Your brief is saved. Studio is checking this existing request for a short time. These status
        checks never start another request or create another provider charge.
      </p>
      {hasEarlierDraft ? <p>Your earlier immutable draft remains unchanged.</p> : null}
      {pollingFinished ? (
        <p>
          Automatic status checks paused. You may leave this screen and return later, or check the
          same saved request now.
        </p>
      ) : !pollingRequested ? (
        <p role="status">
          This saved request is still in progress. Check its status when you are ready.
        </p>
      ) : (
        <p role="status">
          Checking saved status ({pollCount} of {GENERATION_POLL_LIMIT})…
        </p>
      )}
      <button
        className="secondary-button"
        disabled={pending}
        onClick={() => void refresh()}
        type="button"
      >
        Check draft status
      </button>
      <details className="advanced-details">
        <summary>Advanced generation details</summary>
        <p>
          Job state: <code>{latestJob.state}</code>. Attempts: {latestJob.attemptCount}.
        </p>
      </details>
    </section>
  );
}

function BriefComposer({
  canCreate,
  canCancel,
  execute,
  flow,
  onBriefCreated,
  onCancel,
  organizationId,
  pending,
}: {
  readonly canCreate: boolean;
  readonly canCancel: boolean;
  readonly execute: ExecuteMutation;
  readonly flow: BriefToDraftOperatorFlow;
  readonly onBriefCreated: (briefId: Uuid) => void;
  readonly onCancel: () => void;
  readonly organizationId: Uuid;
  readonly pending: boolean;
}) {
  const [brief, setBrief] = useState(initialBrief);
  const [selectedProfileKey, setSelectedProfileKey] = useState("");
  const [requiredElements, setRequiredElements] = useState(
    initialBrief.required_elements.join("\n"),
  );
  const [prohibitedWording, setProhibitedWording] = useState(
    initialBrief.prohibited_claims_or_wording.join("\n"),
  );
  const reference = brief.scripture_reference;
  const selectedProfile = findStudioContentProfileOption(selectedProfileKey);
  const profileGate = contentProfileGateForOption(selectedProfile);
  const isPhase4b5GuidedAudioPreparation =
    selectedProfile?.profile.profile_id === "guided_audio_reflection" &&
    selectedProfile.profile.profile_version === 1 &&
    selectedProfile.profile.lifecycle === "owner_approved_inactive";
  const updateReference = (patch: Partial<typeof brief.scripture_reference>) => {
    setBrief({
      ...brief,
      scripture_reference: { ...reference, ...patch },
    });
  };

  return (
    <section className="workflow-section" aria-labelledby="brief-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2 id="brief-heading">Create a Strongr Daily brief</h2>
        </div>
        <span className="status-pill status-pill--neutral">Ready</span>
      </div>
      <p>
        Describe the content once. Saving this brief does not contact the provider or create a
        charge. You will choose whether to generate a private draft in the next step.
      </p>
      <form
        className="workflow-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (isPhase4b5GuidedAudioPreparation) {
            void execute(
              "prepare-phase4b5-guided-audio-brief",
              "The one approved development test brief is now locked. Studio did not contact a provider, spend credits, or activate the profile.",
              "The one approved development test brief was not prepared",
              async () => {
                const result = await flow.preparePhase4b5GuidedAudioReflectionBrief({
                  correlationId: newUuid(),
                  organizationId,
                });
                onBriefCreated(result.briefId);
              },
            );
            return;
          }
          if (!selectedProfile || !profileGate.allowed) {
            return;
          }
          const payload: StrongrDailyAudioReflectionV2Brief = {
            ...brief,
            content_profile: selectedProfile.selection,
            prohibited_claims_or_wording: lines(prohibitedWording, 12),
            required_elements: lines(requiredElements, 12),
          };
          void execute(
            "create-brief",
            "Brief saved. Nothing was generated, approved, or published.",
            "The brief was not saved",
            async () => {
              const result = await flow.createBrief({
                brief: payload,
                correlationId: newUuid(),
                organizationId,
                title: payload.working_title,
              });
              onBriefCreated(result.briefId);
            },
          );
        }}
      >
        <ContentProfileSelector onSelect={setSelectedProfileKey} selectedKey={selectedProfileKey} />
        {isPhase4b5GuidedAudioPreparation ? (
          <div className="confirmation-panel" role="status">
            <strong>One approved development test</strong>
            <p>
              Studio will create the pre-approved <em>Quiet Trust</em> brief exactly once. Its
              profile, source manifest, rights record, cost ceiling, and future request hash are
              already locked by the database.
            </p>
            <p>
              There is nothing to edit here. This prepares a private brief only; it does not
              activate this format, contact OpenAI, spend credits, create a draft, or publish
              anything.
            </p>
          </div>
        ) : selectedProfile?.profile.profile_id === "strongr_daily_audio_reflection_v2" ? (
          <>
            <div className="form-grid">
              <Field
                label="Working title"
                maxLength={200}
                onChange={(value) => setBrief({ ...brief, working_title: value })}
                value={brief.working_title}
              />
              <Field
                label="Audience"
                maxLength={160}
                onChange={(value) => setBrief({ ...brief, audience: value })}
                value={brief.audience}
              />
              <Field
                label="Theme"
                maxLength={500}
                onChange={(value) => setBrief({ ...brief, theme: value })}
                value={brief.theme}
              />
              <label>
                Tone
                <select
                  onChange={(event) =>
                    setBrief({
                      ...brief,
                      tone: event.currentTarget.value as StrongrDailyAudioReflectionV2Brief["tone"],
                    })
                  }
                  value={brief.tone}
                >
                  <option value="reflective">Reflective</option>
                  <option value="pastoral">Pastoral</option>
                  <option value="encouraging">Encouraging</option>
                  <option value="challenging">Challenging</option>
                </select>
              </label>
              <label>
                Desired duration in seconds
                <input
                  max={1200}
                  min={60}
                  onChange={(event) =>
                    setBrief({
                      ...brief,
                      desired_duration_seconds: Number(event.currentTarget.value),
                    })
                  }
                  required
                  type="number"
                  value={brief.desired_duration_seconds}
                />
              </label>
              <Field
                label="Scripture reference"
                maxLength={160}
                onChange={(value) => updateReference({ reference: value })}
                value={reference.reference}
              />
              <Field
                label="Translation"
                maxLength={80}
                onChange={(value) => updateReference({ translation: value })}
                value={reference.translation}
              />
              <Field
                label="Source citation"
                maxLength={500}
                onChange={(value) => updateReference({ source_citation: value })}
                value={reference.source_citation}
              />
              <Field
                label="Source brief identifier"
                maxLength={160}
                onChange={(value) => setBrief({ ...brief, source_brief_identifier: value })}
                value={brief.source_brief_identifier}
              />
            </div>
            <label>
              Required elements, one per line
              <textarea
                maxLength={4000}
                onChange={(event) => setRequiredElements(event.currentTarget.value)}
                required
                rows={4}
                value={requiredElements}
              />
            </label>
            <label>
              Prohibited claims or wording, one per line
              <textarea
                maxLength={6000}
                onChange={(event) => setProhibitedWording(event.currentTarget.value)}
                rows={4}
                value={prohibitedWording}
              />
            </label>
            <TextArea
              label="Pastoral purpose"
              maxLength={1000}
              onChange={(value) => setBrief({ ...brief, pastoral_purpose: value })}
              value={brief.pastoral_purpose}
            />
          </>
        ) : (
          <p className="permission-note">
            {selectedProfile
              ? "Profile-specific brief fields are not available because the approved creative rules are unresolved. Studio will not reuse the audio-reflection form or guess this format."
              : "Choose a content format to review its status before any brief fields are shown."}
          </p>
        )}
        <button
          aria-describedby={
            (!isPhase4b5GuidedAudioPreparation && !profileGate.allowed) || !canCreate || pending
              ? "brief-access-reason"
              : undefined
          }
          className="primary-button"
          data-primary-action
          disabled={
            (!isPhase4b5GuidedAudioPreparation && !profileGate.allowed) || !canCreate || pending
          }
          type="submit"
        >
          {isPhase4b5GuidedAudioPreparation
            ? "Prepare the one approved development test"
            : "Save brief"}
        </button>
        {!isPhase4b5GuidedAudioPreparation && !profileGate.allowed ? (
          <p className="permission-note" id="brief-access-reason">
            {profileGate.reason}
          </p>
        ) : !canCreate ? (
          <p className="permission-note" id="brief-access-reason">
            Your current role cannot create content. Ask an organization owner for content-creation
            access.
          </p>
        ) : pending ? (
          <p className="permission-note" id="brief-access-reason">
            Saving the brief now…
          </p>
        ) : null}
        {canCancel ? (
          <button className="text-button" disabled={pending} onClick={onCancel} type="button">
            Cancel and return to saved reflections
          </button>
        ) : null}
      </form>
    </section>
  );
}

function ContentProfileSelector({
  onSelect,
  selectedKey,
}: {
  readonly onSelect: (key: string) => void;
  readonly selectedKey: string;
}) {
  const selected = findStudioContentProfileOption(selectedKey);

  return (
    <section className="content-profile-selector" aria-labelledby="content-profile-heading">
      <div>
        <p className="eyebrow">Choose the exact format first</p>
        <h3 id="content-profile-heading">Content format</h3>
        <p>
          Each format keeps its own approved structure. Studio will never guess a format from the
          title.
        </p>
      </div>
      <label>
        Content format and version
        <select onChange={(event) => onSelect(event.currentTarget.value)} value={selectedKey}>
          <option value="">Choose a content format</option>
          {studioContentProfileOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.profile.display_name} · version {option.profile.profile_version} ·{" "}
              {option.statusLabel}
            </option>
          ))}
        </select>
      </label>
      {selected ? <ContentProfileReview option={selected} /> : null}
    </section>
  );
}

function ContentProfileReview({ option }: { readonly option: StudioContentProfileOption }) {
  const isPhase4b5GuidedAudioPreparation =
    option.profile.profile_id === "guided_audio_reflection" &&
    option.profile.profile_version === 1 &&
    option.profile.lifecycle === "owner_approved_inactive";
  return (
    <div className="content-profile-review" role="status">
      <div className="section-heading">
        <div>
          <strong>{option.profile.display_name}</strong>
          <p>{option.statusSummary}</p>
        </div>
        <span className="status-pill status-pill--neutral">{option.statusLabel}</span>
      </div>
      <p className="permission-note">
        {isPhase4b5GuidedAudioPreparation
          ? "A separately authorized, one-time development brief may be prepared below. This does not activate the profile or contact the provider."
          : "This selection cannot save a new brief or contact the provider until this exact profile version is explicitly activated later."}
      </p>
      {option.profile.unresolved_decisions.length > 0 ? (
        <details className="advanced-details">
          <summary>What still needs approval?</summary>
          <ul>
            {option.profile.unresolved_decisions.map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <details className="advanced-details">
        <summary>Exact profile details</summary>
        <dl className="evidence-list">
          <div>
            <dt>Profile</dt>
            <dd>{option.profile.profile_id}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{option.profile.profile_version}</dd>
          </div>
          <div>
            <dt>Checksum</dt>
            <dd>{shortHash(option.profile.canonical_checksum)}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

function VersionWorkspace({
  canCreate,
  canSubmit,
  execute,
  flow,
  organizationId,
  pending,
  selectedVersion,
  selectVersion,
  versions,
}: {
  readonly canCreate: boolean;
  readonly canSubmit: boolean;
  readonly execute: ExecuteMutation;
  readonly flow: BriefToDraftOperatorFlow;
  readonly organizationId: Uuid;
  readonly pending: boolean;
  readonly selectedVersion: TenantContentVersionSummary | undefined;
  readonly selectVersion: Dispatch<SetStateAction<Uuid | null>>;
  readonly versions: readonly TenantContentVersionSummary[];
}) {
  const reflection = reflectionFromVersion(selectedVersion);
  const profileGate = contentProfileGateForBinding(selectedVersion?.contentProfile ?? null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  return (
    <section className="workflow-section" aria-labelledby="version-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Steps 2–3</p>
          <h2 id="version-heading">Read the saved draft</h2>
        </div>
        <span className="status-pill status-pill--neutral">{versions.length} versions</span>
      </div>
      {versions.length === 0 ? (
        <p>Your draft is still being prepared. Use refresh in a moment to check again.</p>
      ) : (
        <>
          <label>
            Content version
            <select
              onChange={(event) => selectVersion(event.currentTarget.value)}
              value={selectedVersion?.id ?? ""}
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.versionNumber} · {versionStateLabel(version.state)} ·{" "}
                  {versionSourceLabel(version.source)}
                </option>
              ))}
            </select>
          </label>
          {selectedVersion && reflection ? (
            <article className="immutable-card">
              <div className="immutable-card-heading">
                <div>
                  <p className="eyebrow">Version {selectedVersion.versionNumber}</p>
                  <h3>{contentTitle(reflection)}</h3>
                </div>
                <span className="status-pill status-pill--positive">
                  {versionStateLabel(selectedVersion.state)}
                </span>
              </div>
              <details className="advanced-details">
                <summary>Advanced version details</summary>
                <dl className="evidence-list">
                  <div>
                    <dt>Exact identity</dt>
                    <dd>{selectedVersion.id}</dd>
                  </div>
                  <div>
                    <dt>Payload SHA-256</dt>
                    <dd>{selectedVersion.payloadHash}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(selectedVersion.createdAt)}</dd>
                  </div>
                </dl>
              </details>
              <details>
                <summary>Read full draft</summary>
                <ImmutableContentPreview value={reflection} />
              </details>
              {selectedVersion.state === "draft" ? (
                <>
                  <details className="generation-retry">
                    <summary>Need a different draft?</summary>
                    <p>
                      Your current draft remains immutable. Generating another creates a separate
                      draft and a new provider request; it never changes, approves, or publishes
                      this version.
                    </p>
                    <p>
                      Each generation is separately billable and protected by a hard maximum of
                      US$0.10.
                    </p>
                    <label>
                      <input
                        checked={confirmRegenerate}
                        disabled={!profileGate.allowed}
                        onChange={(event) => setConfirmRegenerate(event.currentTarget.checked)}
                        type="checkbox"
                      />
                      I intentionally want one new, separately billable draft request.
                    </label>
                    <button
                      aria-describedby={
                        !profileGate.allowed || !canCreate || !confirmRegenerate || pending
                          ? "regenerate-version-reason"
                          : undefined
                      }
                      className="secondary-button"
                      disabled={!profileGate.allowed || !canCreate || !confirmRegenerate || pending}
                      onClick={() => {
                        if (!profileGate.allowed) {
                          return;
                        }
                        void execute(
                          "regenerate-version",
                          "A new private draft request was sent. The current version remains unchanged.",
                          "A new private draft was not completed",
                          () =>
                            flow.requestGeneration({
                              briefId: selectedVersion.briefId,
                              correlationId: newUuid(),
                              idempotencyKey: newIdempotencyKey(),
                              organizationId,
                              promptKey: "strongr.strongr_daily.v2",
                              promptVersion: 1,
                            }),
                        ).finally(() => setConfirmRegenerate(false));
                      }}
                      type="button"
                    >
                      Generate a different draft
                    </button>
                    {!profileGate.allowed ? (
                      <p className="permission-note" id="regenerate-version-reason">
                        {profileGate.reason}
                      </p>
                    ) : !canCreate ? (
                      <p className="permission-note" id="regenerate-version-reason">
                        Your current role cannot request another draft.
                      </p>
                    ) : !confirmRegenerate ? (
                      <p className="permission-note" id="regenerate-version-reason">
                        Check the confirmation box to unlock a new provider request.
                      </p>
                    ) : pending ? (
                      <p className="permission-note" id="regenerate-version-reason">
                        Studio is sending the new request now.
                      </p>
                    ) : null}
                  </details>
                  <div className="confirmation-panel">
                    <label>
                      <input
                        checked={confirmSubmit}
                        onChange={(event) => setConfirmSubmit(event.currentTarget.checked)}
                        type="checkbox"
                      />
                      Submit version {selectedVersion.versionNumber} for review. The saved draft
                      will not be changed.
                    </label>
                    <button
                      aria-describedby={
                        !canSubmit || !confirmSubmit || pending
                          ? "submit-version-reason"
                          : undefined
                      }
                      className="primary-button"
                      data-primary-action
                      disabled={!canSubmit || !confirmSubmit || pending}
                      onClick={() => {
                        void execute(
                          "submit-version",
                          `Version ${selectedVersion.versionNumber} submitted for review. The saved status was refreshed.`,
                          "The exact version was not confirmed as submitted",
                          () =>
                            flow.submitDraft({
                              contentVersionId: selectedVersion.id,
                              correlationId: newUuid(),
                              organizationId,
                            }),
                        ).finally(() => setConfirmSubmit(false));
                      }}
                      type="button"
                    >
                      Submit this version
                    </button>
                    {!canSubmit ? (
                      <p className="permission-note" id="submit-version-reason">
                        Your current role cannot submit content for review. Ask an organization
                        owner for submission access.
                      </p>
                    ) : !confirmSubmit ? (
                      <p className="permission-note" id="submit-version-reason">
                        Read the draft and check the confirmation box to unlock submission.
                      </p>
                    ) : pending ? (
                      <p className="permission-note" id="submit-version-reason">
                        Submitting this exact version now…
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </article>
          ) : (
            <p role="alert">
              Studio could not read this saved draft. No review or approval action is available.
            </p>
          )}
          {selectedVersion && reflection && !isStrongrDailyV2(reflection) ? (
            <ManualSuccessorForm
              canCreate={canCreate}
              execute={execute}
              flow={flow}
              organizationId={organizationId}
              pending={pending}
              source={selectedVersion}
              value={reflection}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function ImmutableContentPreview({ value }: { readonly value: ImmutableContent }) {
  if (!isStrongrDailyV2(value)) {
    return (
      <div className="content-preview">
        <h4>Opening</h4>
        <p>{value.opening}</p>
        <h4>Reflection</h4>
        <p>{value.reflection}</p>
        <h4>Questions</h4>
        <ul>
          {value.reflection_questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
        <h4>Closing</h4>
        <p>{value.closing}</p>
      </div>
    );
  }
  return (
    <div className="content-preview">
      <h4>Audience</h4>
      <p>{value.audience}</p>
      <h4>Summary</h4>
      <p>{value.short_summary}</p>
      <h4>Pastoral purpose</h4>
      <p>{value.pastoral_purpose}</p>
      <h4>Tone</h4>
      <p>{value.tone}</p>
      <h4>Scripture</h4>
      <p>
        {value.scripture_reference.reference} ({value.scripture_reference.translation})
      </p>
      <p>Source citation: {value.scripture_reference.source_citation}</p>
      {value.scripture_text ? <p>{value.scripture_text}</p> : null}
      <h4>Welcome</h4>
      <p>{value.warm_welcome}</p>
      <h4>Scripture introduction</h4>
      <p>{value.scripture_introduction}</p>
      <h4>Reflective transition</h4>
      <p>{value.reflective_transition}</p>
      <h4>Narration</h4>
      <p>{value.narration_text}</p>
      <h4>Closing</h4>
      <p>{value.closing}</p>
      <h4>Prayer</h4>
      <p>{value.prayer}</p>
      {value.prayer_request_prompt ? (
        <>
          <h4>Prayer request prompt</h4>
          <p>{value.prayer_request_prompt}</p>
        </>
      ) : null}
      <h4>Personal takeaway</h4>
      <p>{value.personal_takeaway_prompt}</p>
      <h4>App description</h4>
      <p>{value.app_description}</p>
      <h4>Prohibited claims or wording</h4>
      {value.prohibited_claims_or_wording.length > 0 ? (
        <ul>
          {value.prohibited_claims_or_wording.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      ) : (
        <p>None specified.</p>
      )}
      <h4>Production metadata</h4>
      <ul>
        <li>Schema: {value.schema_id}</li>
        <li>Artwork prompt: {value.artwork_generation_prompt}</li>
        <li>Social caption: {value.social_caption}</li>
        <li>Keywords: {value.keywords.join(", ")}</li>
        <li>Estimated duration: {value.estimated_duration_seconds} seconds</li>
        <li>Source brief identifier: {value.source_brief_identifier}</li>
        <li>Content type: {value.content_type}</li>
        <li>Content hash: {value.content_hash}</li>
        {value.soft_music_fade_instruction ? (
          <li>Soft music fade instruction: {value.soft_music_fade_instruction}</li>
        ) : null}
      </ul>
    </div>
  );
}

function ManualSuccessorForm({
  canCreate,
  execute,
  flow,
  organizationId,
  pending,
  source,
  value,
}: {
  readonly canCreate: boolean;
  readonly execute: ExecuteMutation;
  readonly flow: BriefToDraftOperatorFlow;
  readonly organizationId: Uuid;
  readonly pending: boolean;
  readonly source: TenantContentVersionSummary;
  readonly value: AudioReflection;
}) {
  const [editor, setEditor] = useState(value);
  const [questions, setQuestions] = useState(value.reflection_questions.join("\n"));

  useEffect(() => {
    setEditor(value);
    setQuestions(value.reflection_questions.join("\n"));
  }, [value]);

  return (
    <details className="editor-panel">
      <summary>Create a manual successor</summary>
      <p>
        The source remains immutable. Saving creates a new draft linked to version{" "}
        {source.versionNumber}.
      </p>
      <form
        className="workflow-form"
        onSubmit={(event) => {
          event.preventDefault();
          void execute(
            "manual-successor",
            "Manual successor created. The source version remains unchanged.",
            "The manual successor was not confirmed as created",
            () =>
              flow.createManualDraft({
                briefId: source.briefId,
                contentItemId: source.contentItemId,
                correlationId: newUuid(),
                organizationId,
                payload: {
                  ...editor,
                  reflection_questions: lines(questions, 5),
                },
                supersedesVersionId: source.id,
              }),
          );
        }}
      >
        <Field
          label="Successor title"
          maxLength={200}
          onChange={(title) => setEditor({ ...editor, title })}
          value={editor.title}
        />
        <TextArea
          label="Opening"
          maxLength={4000}
          onChange={(opening) => setEditor({ ...editor, opening })}
          value={editor.opening}
        />
        <TextArea
          label="Reflection"
          maxLength={20000}
          onChange={(reflection) => setEditor({ ...editor, reflection })}
          rows={8}
          value={editor.reflection}
        />
        <TextArea
          label="Reflection questions, one per line"
          maxLength={2500}
          onChange={setQuestions}
          value={questions}
        />
        <TextArea
          label="Closing"
          maxLength={4000}
          onChange={(closing) => setEditor({ ...editor, closing })}
          value={editor.closing}
        />
        <button
          aria-describedby={!canCreate || pending ? "successor-lock-reason" : undefined}
          className="secondary-button"
          disabled={!canCreate || pending}
          type="submit"
        >
          Create immutable successor
        </button>
        {!canCreate ? (
          <p className="permission-note" id="successor-lock-reason">
            Your current role cannot create a replacement version.
          </p>
        ) : pending ? (
          <p className="permission-note" id="successor-lock-reason">
            Saving the replacement version now…
          </p>
        ) : null}
      </form>
    </details>
  );
}

type GuidedReviewStepKey =
  | "submit"
  | "secure-session"
  | "review-policy"
  | "automated-checks"
  | "scripture-evidence"
  | "rights"
  | "scripture-review"
  | "theology-review"
  | "editorial-review"
  | "approval"
  | "package"
  | "download";

interface GuidedReviewStep {
  readonly detail: string;
  readonly key: GuidedReviewStepKey;
  readonly targetId: string;
  readonly title: string;
}

const guidedStepLabels: ReadonlyArray<Readonly<{ key: GuidedReviewStepKey; label: string }>> = [
  { key: "submit", label: "Submit the draft" },
  { key: "secure-session", label: "Confirm your secure session" },
  { key: "review-policy", label: "Confirm the review rules" },
  { key: "automated-checks", label: "Complete safety checks" },
  { key: "scripture-evidence", label: "Verify the Scripture source" },
  { key: "rights", label: "Confirm usage rights" },
  { key: "scripture-review", label: "Complete Scripture review" },
  { key: "theology-review", label: "Complete pastoral review" },
  { key: "editorial-review", label: "Complete editorial review" },
  { key: "approval", label: "Approve the final version" },
  { key: "package", label: "Create the private package" },
  { key: "download", label: "Download the completed files" },
];

const stepPermission: Partial<Record<GuidedReviewStepKey, string>> = {
  approval: "approval.grant",
  download: "export.request",
  "editorial-review": "review.editorial",
  package: "export.request",
  "review-policy": "role.manage",
  rights: "review.editorial",
  "scripture-evidence": "review.scripture",
  "scripture-review": "review.scripture",
  submit: "content.submit",
  "theology-review": "review.theology",
};

type GuidedCheckState = "blocked" | "complete" | "waiting";

interface GuidedCompletion {
  readonly completed: ReadonlySet<GuidedReviewStepKey>;
  readonly checkState: GuidedCheckState;
}

function guidedCompletion({
  aal2,
  activeApprovals,
  checkDefinitions,
  checkResults,
  checkRuns,
  packages,
  policies,
  reviews,
  rightsSnapshots,
  scriptureEvidence,
  version,
}: {
  readonly aal2: boolean;
  readonly activeApprovals: ReviewToPackageWorkspace["approvalSnapshots"];
  readonly checkDefinitions: ReviewToPackageWorkspace["checkDefinitions"];
  readonly checkResults: ReviewToPackageWorkspace["checkResults"];
  readonly checkRuns: ReviewToPackageWorkspace["checkRuns"];
  readonly packages: ReviewToPackageWorkspace["productionPackages"];
  readonly policies: ReviewToPackageWorkspace["reviewPolicies"];
  readonly reviews: ReviewToPackageWorkspace["reviewDecisions"];
  readonly rightsSnapshots: ReviewToPackageWorkspace["rightsSnapshots"];
  readonly scriptureEvidence: ReviewToPackageWorkspace["scriptureEvidence"];
  readonly version: TenantContentVersionSummary;
}): GuidedCompletion {
  const completed = new Set<GuidedReviewStepKey>();
  const submitted = version.state === "submitted";
  if (submitted) {
    completed.add("submit");
  }
  if (aal2) {
    completed.add("secure-session");
  }
  if (policies.some(({ isActive }) => isActive)) {
    completed.add("review-policy");
  }

  const latestRun = [...checkRuns].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  )[0];
  const latestResults = latestRun
    ? checkResults.filter(({ checkRunId }) => checkRunId === latestRun.id)
    : [];
  const latestResultsByDefinition = new Map(
    latestResults.map((result) => [result.checkDefinitionId, result]),
  );
  const requiredChecksPassed = checkDefinitions.every((definition) => {
    const result = latestResultsByDefinition.get(definition.id);
    if (!result) {
      return false;
    }
    return definition.blocksApproval
      ? result.outcome === "pass"
      : result.outcome === "pass" || result.outcome === "warn";
  });
  const checkState: GuidedCheckState =
    latestRun?.status === "failed" || (latestRun?.status === "completed" && !requiredChecksPassed)
      ? "blocked"
      : latestRun?.status === "completed" && requiredChecksPassed
        ? "complete"
        : "waiting";
  if (checkState === "complete") {
    completed.add("automated-checks");
  }
  if (scriptureEvidence.some(({ verificationStatus }) => verificationStatus === "verified")) {
    completed.add("scripture-evidence");
  }
  if (rightsSnapshots.some(({ status }) => status === "cleared")) {
    completed.add("rights");
  }
  for (const lane of ["scripture", "theology", "editorial"] as const) {
    if (reviews.some((review) => review.lane === lane && review.decision === "approved")) {
      completed.add(`${lane}-review`);
    }
  }
  if (activeApprovals.length > 0) {
    completed.add("approval");
  }
  if (
    packages.some(({ approvalSnapshotId }) =>
      activeApprovals.some(({ id }) => id === approvalSnapshotId),
    )
  ) {
    completed.add("package");
  }
  return { completed, checkState };
}

function guidedReviewStep({
  aal2,
  activeApprovals,
  checkDefinitions,
  checkResults,
  checkRuns,
  packages,
  policies,
  reviews,
  rightsSnapshots,
  scriptureEvidence,
  version,
}: {
  readonly aal2: boolean;
  readonly activeApprovals: ReviewToPackageWorkspace["approvalSnapshots"];
  readonly checkDefinitions: ReviewToPackageWorkspace["checkDefinitions"];
  readonly checkResults: ReviewToPackageWorkspace["checkResults"];
  readonly checkRuns: ReviewToPackageWorkspace["checkRuns"];
  readonly packages: ReviewToPackageWorkspace["productionPackages"];
  readonly policies: ReviewToPackageWorkspace["reviewPolicies"];
  readonly reviews: ReviewToPackageWorkspace["reviewDecisions"];
  readonly rightsSnapshots: ReviewToPackageWorkspace["rightsSnapshots"];
  readonly scriptureEvidence: ReviewToPackageWorkspace["scriptureEvidence"];
  readonly version: TenantContentVersionSummary;
}): GuidedReviewStep {
  const completion = guidedCompletion({
    aal2,
    activeApprovals,
    checkDefinitions,
    checkResults,
    checkRuns,
    packages,
    policies,
    reviews,
    rightsSnapshots,
    scriptureEvidence,
    version,
  });
  if (version.state !== "submitted") {
    return {
      detail:
        "Read the draft above, then submit that exact version for review. Submitting does not approve or publish it.",
      key: "submit",
      targetId: "version-heading",
      title: "Submit this draft for review",
    };
  }
  if (!policies.some(({ isActive }) => isActive)) {
    if (!aal2) {
      return {
        detail:
          "Open Session security and enter the six-digit code currently shown in your authenticator app. The code changing about every 30 seconds is normal.",
        key: "secure-session",
        targetId: "session-security",
        title: "Confirm your secure session",
      };
    }
    return {
      detail:
        "Confirm the review rules for this item. This chooses the required checks and reviews; it does not approve or publish anything.",
      key: "review-policy",
      targetId: "review-policy",
      title: "Confirm the review rules",
    };
  }
  if (completion.checkState !== "complete") {
    return {
      detail:
        completion.checkState === "blocked"
          ? "A required safety check needs attention. Nothing was approved or published. Check the status again; if it remains blocked, ask the Studio operator for help."
          : "Your draft is saved, but the automated safety checks have not finished. Check the status again before continuing.",
      key: "automated-checks",
      targetId: "automated-heading",
      title: "Wait for the safety checks",
    };
  }
  if (!scriptureEvidence.some(({ verificationStatus }) => verificationStatus === "verified")) {
    if (!aal2) {
      return {
        detail:
          "Open Session security and enter the six-digit code currently shown in your authenticator app. The code changing about every 30 seconds is normal.",
        key: "secure-session",
        targetId: "session-security",
        title: "Confirm your secure session",
      };
    }
    return {
      detail:
        "Confirm the reference and translation, add the source you checked, then record the Scripture evidence for this exact version.",
      key: "scripture-evidence",
      targetId: "scripture-evidence",
      title: "Verify the Scripture reference",
    };
  }
  if (!rightsSnapshots.some(({ status }) => status === "cleared")) {
    if (!aal2) {
      return {
        detail:
          "Open Session security and enter the six-digit code currently shown in your authenticator app. The code changing about every 30 seconds is normal.",
        key: "secure-session",
        targetId: "session-security",
        title: "Confirm your secure session",
      };
    }
    return {
      detail:
        "Record why the Scripture and other material may be used. This pilot stores the reference only; do not add unlicensed NIV text.",
      key: "rights",
      targetId: "rights-review",
      title: "Confirm usage rights",
    };
  }
  const missingLane = (["scripture", "theology", "editorial"] as const).find(
    (lane) => !reviews.some((review) => review.lane === lane && review.decision === "approved"),
  );
  if (missingLane) {
    if (!aal2) {
      return {
        detail:
          "Open Session security and enter the six-digit code currently shown in your authenticator app. The code changing about every 30 seconds is normal.",
        key: "secure-session",
        targetId: "session-security",
        title: "Confirm your secure session",
      };
    }
    const labels = {
      editorial: "editorial",
      scripture: "Scripture",
      theology: "pastoral",
    } as const;
    return {
      detail:
        "Choose your decision and write a short note describing what you personally checked. Studio never fills in or approves a human review for you.",
      key: `${missingLane}-review`,
      targetId: `${missingLane}-review`,
      title: `Complete the ${labels[missingLane]} review`,
    };
  }
  if (activeApprovals.length === 0) {
    if (!aal2) {
      return {
        detail:
          "Open Session security and enter the six-digit code currently shown in your authenticator app. The code changing about every 30 seconds is normal.",
        key: "secure-session",
        targetId: "session-security",
        title: "Confirm your secure session",
      };
    }
    return {
      detail:
        "All required reviews are ready. Confirm this final version below. This still does not publish anything.",
      key: "approval",
      targetId: "exact-approval",
      title: "Approve the final version",
    };
  }
  if (
    !packages.some(({ approvalSnapshotId }) =>
      activeApprovals.some(({ id }) => id === approvalSnapshotId),
    )
  ) {
    if (!aal2) {
      return {
        detail:
          "Open Session security and enter the six-digit code currently shown in your authenticator app. The code changing about every 30 seconds is normal.",
        key: "secure-session",
        targetId: "session-security",
        title: "Confirm your secure session",
      };
    }
    return {
      detail:
        "Create private JSON and Markdown files. This does not upload anything to Strongr Daily.",
      key: "package",
      targetId: "production-package",
      title: "Create the private download package",
    };
  }
  return {
    detail:
      "The pilot files are ready to download. No content has been published and no audio has been generated.",
    key: "download",
    targetId: "production-package",
    title: "Download the completed pilot package",
  };
}

function ReviewWorkspace({
  aal2,
  capabilities,
  execute,
  flow,
  organizationId,
  pending,
  refresh,
  selectedVersion,
  workspace,
}: {
  readonly aal2: boolean;
  readonly capabilities: Readonly<Record<string, boolean>> | null;
  readonly execute: ExecuteMutation;
  readonly flow: ReviewToPackageOperatorFlow;
  readonly organizationId: Uuid;
  readonly pending: boolean;
  readonly refresh: () => Promise<void>;
  readonly selectedVersion: TenantContentVersionSummary | undefined;
  readonly workspace: ReviewToPackageWorkspace;
}) {
  if (!selectedVersion) {
    return (
      <section className="workflow-section">
        <p>Select a saved version before continuing its review.</p>
      </section>
    );
  }
  const versionId = selectedVersion.id;
  const checkRuns = workspace.checkRuns.filter(
    ({ contentVersionId }) => contentVersionId === versionId,
  );
  const checkRunIds = new Set(checkRuns.map(({ id }) => id));
  const checkResults = workspace.checkResults.filter(({ checkRunId }) =>
    checkRunIds.has(checkRunId),
  );
  const scriptureEvidence = workspace.scriptureEvidence.filter(
    (record) => record.contentVersionId === versionId,
  );
  const rightsSnapshots = workspace.rightsSnapshots.filter(
    (record) => record.contentVersionId === versionId,
  );
  const reviews = workspace.reviewDecisions.filter(
    (record) => record.contentVersionId === versionId,
  );
  const approvals = workspace.approvalSnapshots.filter(
    (record) => record.contentVersionId === versionId,
  );
  const revokedIds = new Set(
    workspace.approvalRevocations.map(({ approvalSnapshotId }) => approvalSnapshotId),
  );
  const activeApprovals = approvals.filter(({ id }) => !revokedIds.has(id));
  const packages = workspace.productionPackages.filter(({ approvalSnapshotId }) =>
    approvals.some(({ id }) => id === approvalSnapshotId),
  );
  const policies = workspace.reviewPolicies.filter(({ isActive }) => isActive);
  const reflection = reflectionFromVersion(selectedVersion);
  const selectedScriptureReference = reflection
    ? isStrongrDailyV2(reflection)
      ? reflection.scripture_reference
      : reflection.scripture_references[0]
    : undefined;
  const nextStep = guidedReviewStep({
    aal2,
    activeApprovals,
    checkDefinitions: workspace.checkDefinitions,
    checkResults,
    checkRuns,
    packages,
    policies,
    reviews,
    rightsSnapshots,
    scriptureEvidence,
    version: selectedVersion,
  });
  const completion = guidedCompletion({
    aal2,
    activeApprovals,
    checkDefinitions: workspace.checkDefinitions,
    checkResults,
    checkRuns,
    packages,
    policies,
    reviews,
    rightsSnapshots,
    scriptureEvidence,
    version: selectedVersion,
  });
  const reviewActionsAllowed = selectedVersion.state === "submitted" && aal2;
  const requiredPermission = stepPermission[nextStep.key];
  const permissionConfirmed =
    requiredPermission === undefined || Boolean(capabilities?.[requiredPermission]);
  const blockedReason = !permissionConfirmed
    ? "Your current Studio role cannot complete this step. Ask an organization owner to grant the required access."
    : nextStep.key === "automated-checks" && completion.checkState === "blocked"
      ? "The latest safety check did not finish successfully. Nothing was approved or published. Check the status again; if it still fails, ask the Studio operator for help."
      : null;
  const progress = guidedStepLabels.map((step) => ({
    ...step,
    status: completion.completed.has(step.key)
      ? ("completed" as const)
      : step.key === nextStep.key
        ? blockedReason
          ? ("blocked" as const)
          : ("current" as const)
        : ("upcoming" as const),
  }));

  let currentAction: ReactNode;
  if (blockedReason) {
    currentAction = (
      <div className="workflow-blocked">
        <strong>This step needs attention</strong>
        <p>{blockedReason}</p>
        {nextStep.key === "automated-checks" ? (
          <button
            aria-describedby={pending ? "check-again-reason" : undefined}
            className="primary-button"
            data-primary-action
            disabled={pending}
            onClick={() => void refresh()}
            type="button"
          >
            Check again
          </button>
        ) : null}
        {nextStep.key === "automated-checks" && pending ? (
          <p className="permission-note" id="check-again-reason">
            Checking the saved status now…
          </p>
        ) : null}
        {requiredPermission ? (
          <details className="advanced-details">
            <summary>Advanced access details</summary>
            <p>
              Required permission: <code>{requiredPermission}</code>. The database remains the final
              authority.
            </p>
          </details>
        ) : null}
      </div>
    );
  } else {
    switch (nextStep.key) {
      case "submit":
        currentAction = (
          <p className="status-copy">
            Read the saved draft above, confirm the checkbox, and use the single “Submit this
            version” button.
          </p>
        );
        break;
      case "secure-session":
        currentAction = (
          <div className="simple-action">
            <p>
              This is a one-time confirmation for the current session. Your authenticator code
              changing about every 30 seconds is normal.
            </p>
            <Link className="button-link" data-primary-action to="/security">
              Enter the current six-digit code
            </Link>
          </div>
        );
        break;
      case "review-policy":
        currentAction = (
          <PolicyForm
            allowed={Boolean(capabilities?.["role.manage"]) && reviewActionsAllowed}
            execute={execute}
            flow={flow}
            organizationId={organizationId}
            pending={pending}
          />
        );
        break;
      case "automated-checks":
        currentAction = (
          <div className="simple-action">
            <AutomatedEvidence
              checkResults={checkResults}
              checkRuns={checkRuns}
              checkState={completion.checkState}
            />
            <button
              aria-describedby={pending ? "check-again-reason" : undefined}
              className="primary-button"
              data-primary-action
              disabled={pending}
              onClick={() => void refresh()}
              type="button"
            >
              Check again
            </button>
            {pending ? (
              <p className="permission-note" id="check-again-reason">
                Checking the saved status now…
              </p>
            ) : null}
          </div>
        );
        break;
      case "scripture-evidence":
        currentAction = (
          <ScriptureEvidenceForm
            allowed={Boolean(capabilities?.["review.scripture"]) && reviewActionsAllowed}
            execute={execute}
            flow={flow}
            initialReference={selectedScriptureReference?.reference ?? ""}
            initialTranslation={selectedScriptureReference?.translation ?? ""}
            key={`scripture-evidence-${versionId}`}
            organizationId={organizationId}
            pending={pending}
            versionId={versionId}
          />
        );
        break;
      case "rights":
        currentAction = (
          <RightsForm
            allowed={Boolean(capabilities?.["review.editorial"]) && reviewActionsAllowed}
            execute={execute}
            flow={flow}
            key={`rights-${versionId}`}
            organizationId={organizationId}
            pending={pending}
            versionId={versionId}
          />
        );
        break;
      case "scripture-review":
      case "theology-review":
      case "editorial-review": {
        const lane = nextStep.key.replace("-review", "") as ReviewLane;
        currentAction = (
          <ReviewLaneForm
            allowed={Boolean(capabilities?.[`review.${lane}`]) && reviewActionsAllowed}
            execute={execute}
            flow={flow}
            key={`${versionId}-${lane}`}
            lane={lane}
            organizationId={organizationId}
            pending={pending}
            versionId={versionId}
          />
        );
        break;
      }
      case "approval":
      case "package":
      case "download":
        currentAction = (
          <AuthorityActions
            key={versionId}
            aal2={aal2}
            approvals={activeApprovals}
            canApprove={Boolean(capabilities?.["approval.grant"])}
            canExport={Boolean(capabilities?.["export.request"])}
            canRevoke={Boolean(capabilities?.["approval.revoke"])}
            checkRuns={checkRuns}
            execute={execute}
            flow={flow}
            mode={nextStep.key}
            organizationId={organizationId}
            packages={packages}
            pending={pending}
            policies={policies}
            reviews={reviews}
            rightsSnapshots={rightsSnapshots}
            scriptureEvidence={scriptureEvidence}
            version={selectedVersion}
          />
        );
        break;
    }
  }

  return (
    <section
      className="workflow-section"
      aria-label="Guided content workflow"
      aria-labelledby="review-heading"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Finish this item</p>
          <h2 id="review-heading">Follow one clear next step</h2>
        </div>
        <span className="status-pill status-pill--neutral">
          {progress.filter(({ status }) => status === "completed").length} completed
        </span>
      </div>
      <ol className="workflow-progress" aria-label="Content workflow progress">
        {progress.map((step) => (
          <li
            aria-current={
              step.status === "current" || step.status === "blocked" ? "step" : undefined
            }
            className={`workflow-progress__item workflow-progress__item--${step.status}`}
            key={step.key}
          >
            <span aria-hidden="true" className="workflow-progress__marker" />
            <span>{step.label}</span>
            <strong>{step.status[0]?.toUpperCase() + step.status.slice(1)}</strong>
          </li>
        ))}
      </ol>

      <section
        className={`workflow-current-action${blockedReason ? " workflow-current-action--blocked" : ""}`}
        aria-label="Current step"
        aria-labelledby="next-action-heading"
        aria-live="polite"
      >
        <p className="eyebrow">{blockedReason ? "Blocked step" : "Current step"}</p>
        <h3 id="next-action-heading">{nextStep.title}</h3>
        <p>{nextStep.detail}</p>
        {currentAction}
      </section>

      {policies.length > 0 && aal2 && capabilities?.["role.manage"] ? (
        <details className="advanced-details workflow-management">
          <summary>Advanced review-rule management</summary>
          <PolicyForm
            advanced
            allowed={reviewActionsAllowed}
            execute={execute}
            flow={flow}
            organizationId={organizationId}
            pending={pending}
          />
        </details>
      ) : null}

      {activeApprovals.length > 0 ? (
        <AuthorityActions
          key={`${versionId}-management`}
          aal2={aal2}
          approvals={activeApprovals}
          canApprove={Boolean(capabilities?.["approval.grant"])}
          canExport={Boolean(capabilities?.["export.request"])}
          canRevoke={Boolean(capabilities?.["approval.revoke"])}
          checkRuns={checkRuns}
          execute={execute}
          flow={flow}
          mode="management"
          organizationId={organizationId}
          packages={packages}
          pending={pending}
          policies={policies}
          reviews={reviews}
          rightsSnapshots={rightsSnapshots}
          scriptureEvidence={scriptureEvidence}
          version={selectedVersion}
        />
      ) : null}

      <details className="advanced-details workflow-advanced">
        <summary>Advanced workflow details</summary>
        <div className="exact-target">
          <strong>
            Exact version {selectedVersion.versionNumber} · {shortHash(selectedVersion.payloadHash)}
          </strong>
          <span>{selectedVersion.id}</span>
        </div>
        {nextStep.key !== "automated-checks" ? (
          <AutomatedEvidence
            checkResults={checkResults}
            checkRuns={checkRuns}
            checkState={completion.checkState}
          />
        ) : null}
        <CanonicalEvidenceSummary
          approvals={approvals}
          packages={packages}
          reviews={reviews}
          rightsSnapshots={rightsSnapshots}
          scriptureEvidence={scriptureEvidence}
        />
      </details>
    </section>
  );
}

function AutomatedEvidence({
  checkResults,
  checkRuns,
  checkState,
}: {
  readonly checkResults: ReviewToPackageWorkspace["checkResults"];
  readonly checkRuns: ReviewToPackageWorkspace["checkRuns"];
  readonly checkState: GuidedCheckState;
}) {
  return (
    <section className="automated-evidence" aria-labelledby="automated-heading">
      <div>
        <p className="eyebrow">Automated safety checks</p>
        <h3 id="automated-heading">Checks support—but never replace—human review</h3>
        <p>
          {checkState === "complete"
            ? "The required checks completed without a blocking result. People still make every Scripture, pastoral, editorial, rights, and final approval decision."
            : checkState === "blocked"
              ? "A required check needs attention. Nothing was approved or published."
              : "The checks are not complete yet. No approval is assumed."}
        </p>
      </div>
      <details className="advanced-details">
        <summary>Advanced check results</summary>
        {checkRuns.length === 0 ? (
          <p>No saved check run exists for this exact version.</p>
        ) : (
          <ul className="result-list">
            {checkRuns.map((run) => {
              const results = checkResults.filter(({ checkRunId }) => checkRunId === run.id);
              return (
                <li key={run.id}>
                  <strong>
                    {run.engineKey}@{run.engineVersion} · {run.status}
                  </strong>
                  <span>
                    {results.length} result{results.length === 1 ? "" : "s"} ·{" "}
                    {shortHash(run.artifactHash)}
                  </span>
                  <ul>
                    {results.map((result) => (
                      <li key={result.id}>
                        {result.outcome}: {result.detailCode}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </section>
  );
}

function PolicyForm({
  advanced = false,
  allowed,
  execute,
  flow,
  organizationId,
  pending,
}: HumanFormProps & { readonly advanced?: boolean }) {
  const [key, setKey] = useState("m1_3_default");
  const [version, setVersion] = useState(1);
  return (
    <HumanActionCard id="review-policy" title="Confirm the review rules">
      <form
        className="workflow-form"
        onSubmit={submit(async () => {
          await execute(
            "review-policy",
            "Review rules confirmed. The saved status was refreshed.",
            "The review policy was not confirmed as active",
            () =>
              flow.activateReviewPolicy({
                correlationId: newUuid(),
                key,
                organizationId,
                version,
              }),
          );
        })}
      >
        <p className="status-copy">
          Use the approved review rules for this item. This does not approve or publish content.
        </p>
        <details className="advanced-details">
          <summary>Advanced review-rule details</summary>
          <Field label="Policy key" maxLength={100} onChange={setKey} value={key} />
          <label>
            Policy version
            <input
              min={1}
              onChange={(event) => setVersion(Number(event.currentTarget.value))}
              required
              type="number"
              value={version}
            />
          </label>
        </details>
        <button
          aria-describedby={!allowed || pending ? "policy-lock-reason" : undefined}
          className={advanced ? "secondary-button" : "primary-button"}
          data-primary-action={advanced ? undefined : true}
          disabled={!allowed || pending}
          type="submit"
        >
          Use these review rules
        </button>
        {!allowed ? (
          <p className="permission-note" id="policy-lock-reason">
            Your current role cannot choose review rules. Ask an organization owner for access.
          </p>
        ) : pending ? (
          <p className="permission-note" id="policy-lock-reason">
            Saving the review rules now…
          </p>
        ) : null}
      </form>
    </HumanActionCard>
  );
}

function ScriptureEvidenceForm({
  allowed,
  execute,
  flow,
  initialReference,
  initialTranslation,
  organizationId,
  pending,
  versionId,
}: HumanFormProps & {
  readonly initialReference: string;
  readonly initialTranslation: string;
  readonly versionId: Uuid;
}) {
  const [reference, setReference] = useState(initialReference);
  const [translation, setTranslation] = useState(initialTranslation);
  const [citation, setCitation] = useState("");
  const complete = Boolean(reference.trim() && translation.trim() && citation.trim());
  return (
    <HumanActionCard id="scripture-evidence" title="Verify the Scripture reference">
      <form
        className="workflow-form"
        onSubmit={submit(() =>
          execute(
            "scripture-evidence",
            "Scripture evidence recorded for the exact version.",
            "Scripture evidence was not confirmed as recorded",
            () =>
              flow.recordScriptureEvidence({
                contentVersionId: versionId,
                correlationId: newUuid(),
                organizationId,
                reference,
                sourceCitation: citation,
                translation,
                verificationStatus: "verified",
              }),
          ),
        )}
      >
        <p className="status-copy">
          Confirm the reference and translation shown in the saved draft. Add the source you
          personally checked. Do not paste unlicensed Scripture text.
        </p>
        <Field label="Reference" maxLength={160} onChange={setReference} value={reference} />
        <Field label="Translation" maxLength={80} onChange={setTranslation} value={translation} />
        <TextArea label="Source citation" maxLength={500} onChange={setCitation} value={citation} />
        <button
          aria-describedby={!allowed || !complete || pending ? "scripture-lock-reason" : undefined}
          className="primary-button"
          data-primary-action
          disabled={!allowed || !complete || pending}
          type="submit"
        >
          Save Scripture verification
        </button>
        {!allowed ? (
          <p className="permission-note" id="scripture-lock-reason">
            Your current role cannot verify Scripture sources. Ask an organization owner for
            Scripture-review access.
          </p>
        ) : !complete ? (
          <p className="permission-note" id="scripture-lock-reason">
            Add the reference, translation, and source citation to unlock this action.
          </p>
        ) : pending ? (
          <p className="permission-note" id="scripture-lock-reason">
            Saving the Scripture verification now…
          </p>
        ) : null}
      </form>
    </HumanActionCard>
  );
}

function RightsForm({
  allowed,
  execute,
  flow,
  organizationId,
  pending,
  versionId,
}: HumanFormProps & { readonly versionId: Uuid }) {
  const [summary, setSummary] = useState("");
  return (
    <HumanActionCard id="rights-review" title="Confirm usage rights">
      <form
        className="workflow-form"
        onSubmit={submit(() =>
          execute(
            "rights-snapshot",
            "Rights snapshot recorded for the exact version.",
            "Rights evidence was not confirmed as recorded",
            () =>
              flow.recordRightsSnapshot({
                contentVersionId: versionId,
                correlationId: newUuid(),
                organizationId,
                sourceSummary: summary,
                status: "cleared",
              }),
          ),
        )}
      >
        <p className="status-copy">
          Write a short, factual note explaining why the referenced material may be used. This is a
          human clearance decision, not an automated result.
        </p>
        <TextArea
          label="Rights source summary"
          maxLength={2000}
          onChange={setSummary}
          value={summary}
        />
        <button
          aria-describedby={
            !allowed || !summary.trim() || pending ? "rights-lock-reason" : undefined
          }
          className="primary-button"
          data-primary-action
          disabled={!allowed || !summary.trim() || pending}
          type="submit"
        >
          Save rights decision
        </button>
        {!allowed ? (
          <p className="permission-note" id="rights-lock-reason">
            Your current role cannot clear usage rights. Ask an organization owner for editorial
            review access.
          </p>
        ) : !summary.trim() ? (
          <p className="permission-note" id="rights-lock-reason">
            Add the source and rights basis to unlock this action.
          </p>
        ) : pending ? (
          <p className="permission-note" id="rights-lock-reason">
            Saving the usage-rights decision now…
          </p>
        ) : null}
      </form>
    </HumanActionCard>
  );
}

function ReviewLaneForm({
  allowed,
  execute,
  flow,
  lane,
  organizationId,
  pending,
  versionId,
}: HumanFormProps & {
  readonly lane: ReviewLane;
  readonly versionId: Uuid;
}) {
  const [decision, setDecision] = useState<ReviewDecision | "">("");
  const [evidence, setEvidence] = useState("");
  const complete = Boolean(decision && evidence.trim());
  const laneLabel =
    lane === "theology" ? "pastoral" : lane === "scripture" ? "Scripture" : "editorial";
  const reasonId = `${lane}-review-lock-reason`;
  return (
    <HumanActionCard
      id={`${lane}-review`}
      title={`${laneLabel[0]?.toUpperCase()}${laneLabel.slice(1)} review`}
    >
      <form
        className="workflow-form"
        onSubmit={submit(() => {
          if (!decision || !evidence.trim()) {
            return;
          }
          return execute(
            `${lane}-review`,
            `${lane} review decision recorded for the exact version.`,
            `The ${lane} review was not confirmed as recorded`,
            () =>
              flow.recordReview({
                contentVersionId: versionId,
                correlationId: newUuid(),
                decision,
                evidence: { note: evidence, source: "strongr_studio_m3_2" },
                lane,
                organizationId,
                reasonCode: "m3_2_operator_review",
              }),
          );
        })}
      >
        <p className="status-copy">
          Make your own decision after reading this exact version. Add a short note describing what
          you checked; Studio will not write or approve the review for you.
        </p>
        <label>
          Decision
          <select
            onChange={(event) => setDecision(event.currentTarget.value as ReviewDecision | "")}
            value={decision}
          >
            <option disabled value="">
              Choose a decision
            </option>
            <option value="approved">Approved</option>
            <option value="changes_requested">Changes requested</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <TextArea
          label="What you checked"
          maxLength={2000}
          onChange={setEvidence}
          value={evidence}
        />
        <button
          aria-describedby={!allowed || !complete || pending ? reasonId : undefined}
          className="primary-button"
          data-primary-action
          disabled={!allowed || !complete || pending}
          type="submit"
        >
          Save {laneLabel} review
        </button>
        {!allowed ? (
          <p className="permission-note" id={reasonId}>
            Your current role cannot complete this review. Ask an organization owner for {laneLabel}{" "}
            review access.
          </p>
        ) : !complete ? (
          <p className="permission-note" id={reasonId}>
            Choose a decision and write what you checked to unlock this action.
          </p>
        ) : pending ? (
          <p className="permission-note" id={reasonId}>
            Saving this review now…
          </p>
        ) : null}
      </form>
    </HumanActionCard>
  );
}

function CanonicalEvidenceSummary({
  approvals,
  packages,
  reviews,
  rightsSnapshots,
  scriptureEvidence,
}: {
  readonly approvals: ReviewToPackageWorkspace["approvalSnapshots"];
  readonly packages: ReviewToPackageWorkspace["productionPackages"];
  readonly reviews: ReviewToPackageWorkspace["reviewDecisions"];
  readonly rightsSnapshots: ReviewToPackageWorkspace["rightsSnapshots"];
  readonly scriptureEvidence: ReviewToPackageWorkspace["scriptureEvidence"];
}) {
  return (
    <section className="canonical-summary" aria-labelledby="canonical-evidence-heading">
      <h3 id="canonical-evidence-heading">Canonical human-governance records</h3>
      <dl>
        <div>
          <dt>Scripture evidence</dt>
          <dd>{scriptureEvidence.length}</dd>
        </div>
        <div>
          <dt>Rights snapshots</dt>
          <dd>{rightsSnapshots.length}</dd>
        </div>
        <div>
          <dt>Human decisions</dt>
          <dd>{reviews.length}</dd>
        </div>
        <div>
          <dt>Approvals</dt>
          <dd>{approvals.length}</dd>
        </div>
        <div>
          <dt>Packages</dt>
          <dd>{packages.length}</dd>
        </div>
      </dl>
    </section>
  );
}

type PackageDownloadState =
  | Readonly<{ status: "preparing" }>
  | Readonly<{ status: "error" }>
  | Readonly<{
      jsonName: string;
      jsonUrl: string;
      markdownName: string;
      markdownUrl: string;
      stage: "json" | "markdown" | "complete";
      status: "ready";
    }>;

function PackageDownloadActions({
  productionPackage,
}: {
  readonly productionPackage: TenantProductionPackageSummary;
}) {
  const { announce, reportWorkflowFailure } = useStudioSession();
  const [exportedAt, setExportedAt] = useState(() => new Date().toISOString());
  const [state, setState] = useState<PackageDownloadState>({ status: "preparing" });

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    setState({ status: "preparing" });
    void createStrongrDailyApprovedExport({
      exportedAt,
      productionPackage,
    })
      .then((files) => {
        if (!active) return;
        const name = `strongr-daily-approved-${productionPackage.id}`;
        const jsonUrl = URL.createObjectURL(new Blob([files.json], { type: "application/json" }));
        const markdownUrl = URL.createObjectURL(
          new Blob([files.markdown], { type: "text/markdown" }),
        );
        urls.push(jsonUrl, markdownUrl);
        setState({
          jsonName: `${name}.json`,
          jsonUrl,
          markdownName: `${name}.md`,
          markdownUrl,
          stage: "json",
          status: "ready",
        });
      })
      .catch((error) => {
        if (!active) return;
        setState({ status: "error" });
        reportWorkflowFailure(error, "The approved Strongr Daily package was not prepared");
      });
    return () => {
      active = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [exportedAt, productionPackage, reportWorkflowFailure]);

  if (state.status === "preparing") {
    return <p role="status">Preparing the two private files securely...</p>;
  }
  if (state.status === "error") {
    return (
      <div className="workflow-recovery" role="alert">
        <p>No file was downloaded. The saved package remains unchanged.</p>
        <button
          className="primary-button"
          data-primary-action
          onClick={() => setExportedAt(new Date().toISOString())}
          type="button"
        >
          Try preparing the files again
        </button>
      </div>
    );
  }
  if (state.stage === "json") {
    return (
      <>
        <a
          className="primary-button button-link"
          data-primary-action
          download={state.jsonName}
          href={state.jsonUrl}
          onClick={() => {
            globalThis.setTimeout(() => setState({ ...state, stage: "markdown" }), 0);
          }}
        >
          Download JSON (1 of 2)
        </a>
        <p className="permission-note">
          After this file downloads, Studio will show the Markdown file.
        </p>
      </>
    );
  }
  if (state.stage === "markdown") {
    return (
      <>
        <a
          className="primary-button button-link"
          data-primary-action
          download={state.markdownName}
          href={state.markdownUrl}
          onClick={() => {
            globalThis.setTimeout(() => {
              setState({ ...state, stage: "complete" });
              announce("Both approved Strongr Daily files were downloaded. Nothing was published.");
            }, 0);
          }}
        >
          Download Markdown (2 of 2)
        </a>
        <p className="permission-note">
          This is the final private file. Nothing will be published.
        </p>
      </>
    );
  }
  return (
    <div className="workflow-confirmation" role="status">
      <strong>Both private files are downloaded.</strong>
      <p>Nothing was published or uploaded.</p>
    </div>
  );
}

function AuthorityActions({
  aal2,
  approvals,
  canApprove,
  canExport,
  canRevoke,
  checkRuns,
  execute,
  flow,
  mode,
  organizationId,
  packages,
  pending,
  policies,
  reviews,
  rightsSnapshots,
  scriptureEvidence,
  version,
}: {
  readonly aal2: boolean;
  readonly approvals: readonly TenantApprovalSnapshotSummary[];
  readonly canApprove: boolean;
  readonly canExport: boolean;
  readonly canRevoke: boolean;
  readonly checkRuns: ReviewToPackageWorkspace["checkRuns"];
  readonly execute: ExecuteMutation;
  readonly flow: ReviewToPackageOperatorFlow;
  readonly mode: "approval" | "download" | "management" | "package";
  readonly organizationId: Uuid;
  readonly packages: ReviewToPackageWorkspace["productionPackages"];
  readonly pending: boolean;
  readonly policies: ReviewToPackageWorkspace["reviewPolicies"];
  readonly reviews: ReviewToPackageWorkspace["reviewDecisions"];
  readonly rightsSnapshots: ReviewToPackageWorkspace["rightsSnapshots"];
  readonly scriptureEvidence: ReviewToPackageWorkspace["scriptureEvidence"];
  readonly version: TenantContentVersionSummary;
}) {
  const [policyId, setPolicyId] = useState("");
  const [checkRunId, setCheckRunId] = useState("");
  const [scriptureEvidenceId, setScriptureEvidenceId] = useState("");
  const [rightsSnapshotId, setRightsSnapshotId] = useState("");
  const [scriptureReviewId, setScriptureReviewId] = useState("");
  const [theologyReviewId, setTheologyReviewId] = useState("");
  const [editorialReviewId, setEditorialReviewId] = useState("");
  const [approvalId, setApprovalId] = useState("");
  const [revocationApprovalId, setRevocationApprovalId] = useState("");
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [confirmPackage, setConfirmPackage] = useState(false);
  const [confirmRevocation, setConfirmRevocation] = useState(false);
  const [revocationReason, setRevocationReason] = useState("evidence_changed");

  useEffect(() => {
    setPolicyId(policies[0]?.id ?? "");
    setCheckRunId(checkRuns.find(({ status }) => status === "completed")?.id ?? "");
    setScriptureEvidenceId(
      scriptureEvidence.find(({ verificationStatus }) => verificationStatus === "verified")?.id ??
        "",
    );
    setRightsSnapshotId(rightsSnapshots.find(({ status }) => status === "cleared")?.id ?? "");
    setScriptureReviewId(
      reviews.find(({ decision, lane }) => lane === "scripture" && decision === "approved")?.id ??
        "",
    );
    setTheologyReviewId(
      reviews.find(({ decision, lane }) => lane === "theology" && decision === "approved")?.id ??
        "",
    );
    setEditorialReviewId(
      reviews.find(({ decision, lane }) => lane === "editorial" && decision === "approved")?.id ??
        "",
    );
    setApprovalId(approvals[0]?.id ?? "");
    setRevocationApprovalId(approvals[0]?.id ?? "");
  }, [approvals, checkRuns, policies, reviews, rightsSnapshots, scriptureEvidence]);

  const approvalComplete = [
    policyId,
    checkRunId,
    scriptureEvidenceId,
    rightsSnapshotId,
    scriptureReviewId,
    theologyReviewId,
    editorialReviewId,
  ].every(Boolean);
  const missingApprovalEvidence = [
    [policyId, "active review policy"],
    [checkRunId, "completed automated checks"],
    [scriptureEvidenceId, "verified Scripture evidence"],
    [rightsSnapshotId, "cleared rights"],
    [scriptureReviewId, "approved Scripture review"],
    [theologyReviewId, "approved theology review"],
    [editorialReviewId, "approved editorial review"],
  ]
    .filter(([id]) => !id)
    .map(([, label]) => label);
  const selectedApproval = approvals.find(({ id }) => id === approvalId);
  const existingPackage = packages.find(
    ({ approvalSnapshotId }) => approvalId === approvalSnapshotId,
  );

  return (
    <div className="authority-grid authority-grid--single">
      {mode === "approval" ? (
        <section
          className="authority-card"
          id="exact-approval"
          aria-labelledby="approval-action-heading"
        >
          <p className="eyebrow">Final human approval</p>
          <h3 id="approval-action-heading">Approve this exact version</h3>
          <p>
            Confirm that you are approving this version and the completed reviews shown in the
            workflow. This does not publish anything.
          </p>
          <details className="advanced-details">
            <summary>Advanced evidence details</summary>
            <p>
              The database binds the exact version, policy, check run, Scripture source, rights
              record, and three human decisions. These selections are loaded from the completed
              steps.
            </p>
            <div className="form-grid">
              <EvidenceSelect
                label="Active review policy"
                onChange={setPolicyId}
                options={policies.map((policy) => ({
                  id: policy.id,
                  label: `${policy.key}@${policy.version} · ${shortHash(policy.policyHash)}`,
                }))}
                value={policyId}
              />
              <EvidenceSelect
                label="Completed automated check run"
                onChange={setCheckRunId}
                options={checkRuns
                  .filter(({ status }) => status === "completed")
                  .map((run) => ({
                    id: run.id,
                    label: `${run.engineKey}@${run.engineVersion} · ${shortHash(run.artifactHash)}`,
                  }))}
                value={checkRunId}
              />
              <EvidenceSelect
                label="Verified Scripture evidence"
                onChange={setScriptureEvidenceId}
                options={scriptureEvidence
                  .filter(({ verificationStatus }) => verificationStatus === "verified")
                  .map((record) => ({ id: record.id, label: `${record.reference} · verified` }))}
                value={scriptureEvidenceId}
              />
              <EvidenceSelect
                label="Cleared rights snapshot"
                onChange={setRightsSnapshotId}
                options={rightsSnapshots
                  .filter(({ status }) => status === "cleared")
                  .map((record) => ({
                    id: record.id,
                    label: `Cleared · ${shortHash(record.snapshotHash)}`,
                  }))}
                value={rightsSnapshotId}
              />
              <EvidenceSelect
                label="Approved Scripture review"
                onChange={setScriptureReviewId}
                options={reviewOptions(reviews, "scripture")}
                value={scriptureReviewId}
              />
              <EvidenceSelect
                label="Approved pastoral review"
                onChange={setTheologyReviewId}
                options={reviewOptions(reviews, "theology")}
                value={theologyReviewId}
              />
              <EvidenceSelect
                label="Approved editorial review"
                onChange={setEditorialReviewId}
                options={reviewOptions(reviews, "editorial")}
                value={editorialReviewId}
              />
            </div>
          </details>
          <label className="confirmation-label">
            <input
              checked={confirmApproval}
              onChange={(event) => setConfirmApproval(event.currentTarget.checked)}
              type="checkbox"
            />
            I confirm I am approving version {version.versionNumber} and only its completed review
            evidence.
          </label>
          <button
            className="primary-button"
            aria-describedby={
              !aal2 || !canApprove || !approvalComplete || !confirmApproval || pending
                ? "approval-lock-reason"
                : undefined
            }
            data-primary-action
            disabled={!aal2 || !canApprove || !approvalComplete || !confirmApproval || pending}
            onClick={() => {
              void execute(
                "approve-version",
                `Version ${version.versionNumber} approved. The saved status was refreshed.`,
                "The exact version was not confirmed as approved",
                () =>
                  flow.approveVersion({
                    checkRunId,
                    contentVersionId: version.id,
                    correlationId: newUuid(),
                    editorialReviewId,
                    organizationId,
                    reasonCode: "m3_2_operator_approval",
                    reviewPolicyId: policyId,
                    rightsSnapshotId,
                    scriptureEvidenceId,
                    scriptureReviewId,
                    theologyReviewId,
                  }),
              ).finally(() => setConfirmApproval(false));
            }}
            type="button"
          >
            Approve this version
          </button>
          {!aal2 ? (
            <p className="permission-note" id="approval-lock-reason">
              Confirm your secure session before approving.
            </p>
          ) : !canApprove ? (
            <p className="permission-note" id="approval-lock-reason">
              Your current role cannot approve content. Ask an organization owner for approval
              access.
            </p>
          ) : missingApprovalEvidence.length > 0 ? (
            <p className="permission-note" id="approval-lock-reason">
              Approval is locked. Complete: {missingApprovalEvidence.join(", ")}.
            </p>
          ) : !confirmApproval ? (
            <p className="permission-note" id="approval-lock-reason">
              Check the confirmation box to unlock the approval button.
            </p>
          ) : pending ? (
            <p className="permission-note" id="approval-lock-reason">
              Saving this approval now…
            </p>
          ) : null}
        </section>
      ) : null}

      {mode === "package" || mode === "download" ? (
        <section
          className="authority-card"
          id="production-package"
          aria-labelledby="package-action-heading"
        >
          <p className="eyebrow">Private files</p>
          <h3 id="package-action-heading">
            {mode === "download" ? "Download the completed package" : "Create the private package"}
          </h3>
          <p>
            {mode === "download"
              ? "The approved JSON and Markdown files are ready. Downloading does not publish or upload them."
              : "This creates private JSON and Markdown files for review or later manual use. It does not publish or upload anything."}
          </p>
          <details className="advanced-details">
            <summary>Advanced approval details</summary>
            <EvidenceSelect
              label="Unrevoked approval"
              onChange={setApprovalId}
              options={approvals.map((approval) => ({
                id: approval.id,
                label: `${formatDate(approval.approvedAt)} · ${shortHash(approval.evidenceBundleHash)}`,
              }))}
              value={approvalId}
            />
            {selectedApproval ? (
              <p className="operation-detail">
                Exact approval {selectedApproval.id}; evidence{" "}
                {shortHash(selectedApproval.evidenceBundleHash)}.
              </p>
            ) : null}
          </details>
          {mode === "download" && existingPackage ? (
            <PackageDownloadActions productionPackage={existingPackage} />
          ) : null}
          {mode === "package" ? (
            <>
              <label className="confirmation-label">
                <input
                  checked={confirmPackage}
                  onChange={(event) => setConfirmPackage(event.currentTarget.checked)}
                  type="checkbox"
                />
                I confirm this creates private files only. It does not publish.
              </label>
              <button
                aria-describedby={
                  !aal2 ||
                  !canExport ||
                  !approvalId ||
                  existingPackage ||
                  !confirmPackage ||
                  pending
                    ? "package-lock-reason"
                    : undefined
                }
                className="primary-button"
                data-primary-action
                disabled={
                  !aal2 ||
                  !canExport ||
                  !approvalId ||
                  Boolean(existingPackage) ||
                  !confirmPackage ||
                  pending
                }
                onClick={() => {
                  void execute(
                    "create-package",
                    "Private package created. No publication occurred.",
                    "The package was not confirmed as created",
                    () =>
                      flow.createProductionPackage({
                        approvalSnapshotId: approvalId,
                        correlationId: newUuid(),
                        organizationId,
                      }),
                  ).finally(() => setConfirmPackage(false));
                }}
                type="button"
              >
                Create private package
              </button>
              {!aal2 ? (
                <p className="permission-note" id="package-lock-reason">
                  Confirm your secure session before creating private files.
                </p>
              ) : !approvalId ? (
                <p className="permission-note" id="package-lock-reason">
                  Final approval must be completed before creating the package.
                </p>
              ) : !canExport ? (
                <p className="permission-note" id="package-lock-reason">
                  Your current role cannot create export files. Ask an organization owner for export
                  access.
                </p>
              ) : !confirmPackage ? (
                <p className="permission-note" id="package-lock-reason">
                  Check the confirmation box to unlock package creation.
                </p>
              ) : existingPackage ? (
                <p className="permission-note" id="package-lock-reason">
                  The private package already exists and cannot be overwritten.
                </p>
              ) : pending ? (
                <p className="permission-note" id="package-lock-reason">
                  Creating the private package now…
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {mode === "management" && approvals.length > 0 ? (
        <details className="advanced-details authority-management">
          <summary>Advanced: revoke an approval</summary>
          <section
            className="authority-card authority-card--danger"
            aria-labelledby="revoke-heading"
          >
            <p className="eyebrow">Append-only revocation</p>
            <h3 id="revoke-heading">Revoke approval authority</h3>
            <EvidenceSelect
              label="Unrevoked approval"
              onChange={setRevocationApprovalId}
              options={approvals.map((approval) => ({
                id: approval.id,
                label: `${formatDate(approval.approvedAt)} · ${shortHash(approval.evidenceBundleHash)}`,
              }))}
              value={revocationApprovalId}
            />
            <Field
              label="Machine reason code"
              maxLength={80}
              onChange={setRevocationReason}
              value={revocationReason}
            />
            <label className="confirmation-label">
              <input
                checked={confirmRevocation}
                onChange={(event) => setConfirmRevocation(event.currentTarget.checked)}
                type="checkbox"
              />
              I confirm this append-only revocation removes future authority from the exact
              approval.
            </label>
            <button
              className="danger-button"
              aria-describedby={
                !aal2 || !canRevoke || !revocationApprovalId || !confirmRevocation || pending
                  ? "revocation-lock-reason"
                  : undefined
              }
              disabled={
                !aal2 || !canRevoke || !revocationApprovalId || !confirmRevocation || pending
              }
              onClick={() => {
                void execute(
                  "revoke-approval",
                  "Approval revoked. The saved status was refreshed.",
                  "The approval was not confirmed as revoked",
                  () =>
                    flow.revokeApproval({
                      approvalSnapshotId: revocationApprovalId,
                      correlationId: newUuid(),
                      organizationId,
                      reasonCode: revocationReason,
                    }),
                ).finally(() => setConfirmRevocation(false));
              }}
              type="button"
            >
              Revoke exact approval
            </button>
            {!aal2 ? (
              <p className="permission-note" id="revocation-lock-reason">
                Confirm your secure session before revoking an approval.
              </p>
            ) : !canRevoke ? (
              <p className="permission-note" id="revocation-lock-reason">
                Your current role cannot revoke approvals. Ask an organization owner for revocation
                access.
              </p>
            ) : !revocationApprovalId ? (
              <p className="permission-note" id="revocation-lock-reason">
                Choose the exact approval to revoke.
              </p>
            ) : !confirmRevocation ? (
              <p className="permission-note" id="revocation-lock-reason">
                Check the confirmation box to unlock revocation.
              </p>
            ) : pending ? (
              <p className="permission-note" id="revocation-lock-reason">
                Saving the revocation now…
              </p>
            ) : null}
          </section>
        </details>
      ) : null}
    </div>
  );
}

interface HumanFormProps {
  readonly allowed: boolean;
  readonly execute: ExecuteMutation;
  readonly flow: ReviewToPackageOperatorFlow;
  readonly organizationId: Uuid;
  readonly pending: boolean;
}

function HumanActionCard({
  children,
  id,
  title,
}: {
  readonly children: React.ReactNode;
  readonly id: string;
  readonly title: string;
}) {
  return (
    <article id={id}>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function reviewOptions(reviews: ReviewToPackageWorkspace["reviewDecisions"], lane: ReviewLane) {
  return reviews
    .filter((review) => review.lane === lane && review.decision === "approved")
    .map((review) => ({
      id: review.id,
      label: `Approved · ${formatDate(review.createdAt)} · ${review.reasonCode}`,
    }));
}

function EvidenceSelect({
  label,
  onChange,
  options,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly Readonly<{ id: string; label: string }>[];
  readonly value: string;
}) {
  return (
    <label>
      {label}
      <select
        disabled={options.length === 0}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.length === 0 ? (
          <option value="">Not ready — complete the guided steps first</option>
        ) : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  maxLength,
  onChange,
  value,
}: {
  readonly label: string;
  readonly maxLength: number;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <label>
      {label}
      <input
        maxLength={maxLength}
        onChange={(event) => onChange(event.currentTarget.value)}
        required
        value={value}
      />
    </label>
  );
}

function TextArea({
  label,
  maxLength,
  onChange,
  rows = 4,
  value,
}: {
  readonly label: string;
  readonly maxLength: number;
  readonly onChange: (value: string) => void;
  readonly rows?: number;
  readonly value: string;
}) {
  return (
    <label>
      {label}
      <textarea
        maxLength={maxLength}
        onChange={(event) => onChange(event.currentTarget.value)}
        required
        rows={rows}
        value={value}
      />
    </label>
  );
}

function submit(handler: () => void | Promise<void>) {
  return (event: FormEvent) => {
    event.preventDefault();
    void handler();
  };
}
