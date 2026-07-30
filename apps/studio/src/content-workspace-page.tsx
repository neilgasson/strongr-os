import {
  type Dispatch,
  type FormEvent,
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
  TenantContentVersionSummary,
  TenantProductionPackageSummary,
  Uuid,
} from "../../../packages/contracts/src/index.ts";

import {
  BriefToDraftOperatorFlow,
  type BriefToDraftWorkspace,
  GenerationRequestDeferredError,
} from "./brief-to-draft-flow.ts";
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

type ExecuteMutation = (
  key: string,
  success: string,
  failure: string,
  action: () => Promise<unknown>,
) => Promise<void>;

const initialScriptureReference = Object.freeze({
  reference: "Synthetic Reference 1:1",
  source_citation: "Synthetic fixture; not a Scripture quotation",
  translation: "TEST",
});

const initialBrief: StrongrDailyAudioReflectionV2Brief = Object.freeze({
  audience: "Adults seeking a moment of prayer",
  content_type: "audio_reflection",
  desired_duration_seconds: 300,
  pastoral_purpose: "Offer a calm, Scripture-grounded moment of reflection and prayer.",
  prohibited_claims_or_wording: ["Do not promise outcomes that Scripture does not promise."],
  required_elements: ["Scripture reflection", "Prayer", "Personal takeaway"],
  schema_id: "strongr.strongr_daily_audio_reflection_brief.v2",
  scripture_reference: initialScriptureReference,
  source_brief_identifier: "strongr-daily-owner-brief",
  theme: "Be still before God",
  tone: "pastoral",
  working_title: "Be Still",
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

function downloadTextFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  link.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadStrongrDailyPackage(productionPackage: TenantProductionPackageSummary) {
  const files = createStrongrDailyApprovedExport({
    exportedAt: new Date().toISOString(),
    productionPackage,
  });
  const name = `strongr-daily-approved-${productionPackage.id}`;
  downloadTextFile(`${name}.json`, files.json, "application/json");
  downloadTextFile(`${name}.md`, files.markdown, "text/markdown");
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

export function ContentWorkspacePage() {
  const { activeOrganization, announce, capabilities, foundation, mfa, reportWorkflowFailure } =
    useStudioSession();
  const [workspace, setWorkspace] = useState<WorkspaceState>({ status: "loading" });
  const [selectedVersionId, setSelectedVersionId] = useState<Uuid | null>(null);
  const [pendingMutation, setPendingMutation] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const draftFlow = useMemo(
    () => (foundation ? new BriefToDraftOperatorFlow(foundation) : null),
    [foundation],
  );
  const reviewFlow = useMemo(
    () => (foundation ? new ReviewToPackageOperatorFlow(foundation) : null),
    [foundation],
  );

  const refresh = useCallback(async () => {
    if (!activeOrganization || !draftFlow || !reviewFlow) {
      return;
    }
    setWorkspace({ status: "loading" });
    try {
      const [draft, review] = await Promise.all([
        draftFlow.loadWorkspace(activeOrganization.id),
        reviewFlow.loadWorkspace(activeOrganization.id),
      ]);
      setWorkspace({ status: "ready", value: Object.freeze({ draft, review }) });
    } catch (error) {
      reportWorkflowFailure(error, "The governed content workspace could not be loaded");
      setWorkspace({
        message: "Canonical content state could not be loaded. No workflow success is assumed.",
        status: "error",
      });
    }
  }, [activeOrganization, draftFlow, reportWorkflowFailure, reviewFlow]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (workspace.status !== "ready") {
      return;
    }
    const versions = workspace.value.draft.versions;
    if (versions.some(({ id }) => id === selectedVersionId)) {
      return;
    }
    setSelectedVersionId(versions[0]?.id ?? null);
  }, [selectedVersionId, workspace]);

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
      } catch (error) {
        if (error instanceof GenerationRequestDeferredError) {
          announce(
            `The brief is durable, but generation was not requested. Brief ${error.briefId}; content item ${error.contentItemId}. Reload canonical state before deciding whether to continue.`,
          );
        } else {
          reportWorkflowFailure(error, failure);
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
      ? workspace.value.draft.versions.find(({ id }) => id === selectedVersionId)
      : undefined;
  const aal2 = mfa.status === "ready" && mfa.value.currentLevel === "aal2";

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Governed content · {activeOrganization.name}</p>
        <h1>Brief through immutable package.</h1>
        <p>
          Studio guides the work and reloads canonical records. Every mutation names this active
          organization; PostgreSQL rechecks tenant, permission, workflow state, exact identity, and
          assurance.
        </p>
      </div>

      <section className="workflow-safety" aria-label="Current workflow safety">
        <div>
          <strong>{aal2 ? "AAL2 session" : "AAL2 not confirmed"}</strong>
          <p>
            {aal2
              ? "Sensitive commands still recheck assurance inside the database transaction."
              : "Brief and draft work may continue where permitted. Human evidence, review, approval, package, and revocation require step-up."}
          </p>
        </div>
        {!aal2 ? (
          <Link className="button-link" to="/security">
            Open session security
          </Link>
        ) : null}
        <button
          className="secondary-button"
          disabled={workspace.status === "loading" || pendingMutation !== null}
          onClick={() => void refresh()}
          type="button"
        >
          Reload canonical state
        </button>
      </section>

      {workspace.status === "loading" ? (
        <p role="status">Loading canonical briefs, versions, evidence, reviews, and packages…</p>
      ) : null}
      {workspace.status === "error" ? <p role="alert">{workspace.message}</p> : null}
      {workspace.status === "ready" ? (
        <div className="content-workspace">
          <BriefComposer
            canCreate={capabilities.status === "ready" && capabilities.value["content.create"]}
            execute={execute}
            flow={draftFlow}
            organizationId={activeOrganization.id}
            pending={pendingMutation !== null}
          />
          <VersionWorkspace
            canCreate={capabilities.status === "ready" && capabilities.value["content.create"]}
            canSubmit={capabilities.status === "ready" && capabilities.value["content.submit"]}
            execute={execute}
            flow={draftFlow}
            organizationId={activeOrganization.id}
            pending={pendingMutation !== null}
            selectedVersion={selectedVersion}
            selectVersion={setSelectedVersionId}
            versions={workspace.value.draft.versions}
          />
          <ReviewWorkspace
            aal2={aal2}
            capabilities={capabilities.status === "ready" ? capabilities.value : null}
            execute={execute}
            flow={reviewFlow}
            organizationId={activeOrganization.id}
            pending={pendingMutation !== null}
            selectedVersion={selectedVersion}
            workspace={workspace.value.review}
          />
        </div>
      ) : null}
    </>
  );
}

function BriefComposer({
  canCreate,
  execute,
  flow,
  organizationId,
  pending,
}: {
  readonly canCreate: boolean;
  readonly execute: ExecuteMutation;
  readonly flow: BriefToDraftOperatorFlow;
  readonly organizationId: Uuid;
  readonly pending: boolean;
}) {
  const [brief, setBrief] = useState(initialBrief);
  const [requiredElements, setRequiredElements] = useState(
    initialBrief.required_elements.join("\n"),
  );
  const [prohibitedWording, setProhibitedWording] = useState(
    initialBrief.prohibited_claims_or_wording.join("\n"),
  );
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const reference = brief.scripture_reference;
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
        <span className="status-pill status-pill--neutral">Schema validated</span>
      </div>
      <p>
        Brief creation and generation request are separate durable commands. The current idempotency
        key is stable until this request succeeds.
      </p>
      <form
        className="workflow-form"
        onSubmit={(event) => {
          event.preventDefault();
          const payload: StrongrDailyAudioReflectionV2Brief = {
            ...brief,
            prohibited_claims_or_wording: lines(prohibitedWording, 12),
            required_elements: lines(requiredElements, 12),
          };
          void execute(
            "create-brief",
            "Brief created and generation requested. Canonical job status was reloaded.",
            "The brief-to-generation request did not complete",
            async () => {
              await flow.createBriefAndRequestGeneration({
                brief: payload,
                correlationId: newUuid(),
                idempotencyKey,
                organizationId,
                promptKey: "strongr.strongr_daily.fixture",
                promptVersion: 1,
                title: payload.working_title,
              });
              setIdempotencyKey(newIdempotencyKey());
            },
          );
        }}
      >
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
        <p className="operation-detail">
          Stable request key: <code>{idempotencyKey}</code>
        </p>
        <button className="primary-button" disabled={!canCreate || pending} type="submit">
          Create brief and request generation
        </button>
        {!canCreate ? (
          <p className="permission-note">
            `content.create` is not confirmed. The database remains authoritative if a request is
            forced.
          </p>
        ) : null}
      </form>
    </section>
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
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  return (
    <section className="workflow-section" aria-labelledby="version-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Steps 2–3</p>
          <h2 id="version-heading">Inspect an immutable version</h2>
        </div>
        <span className="status-pill status-pill--neutral">{versions.length} versions</span>
      </div>
      {versions.length === 0 ? (
        <p>No canonical version exists yet. Refresh after the durable worker succeeds.</p>
      ) : (
        <>
          <label>
            Exact content version
            <select
              onChange={(event) => selectVersion(event.currentTarget.value)}
              value={selectedVersion?.id ?? ""}
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.versionNumber} · {version.state} · {version.source}
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
                <span className="status-pill status-pill--positive">{selectedVersion.state}</span>
              </div>
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
              <details>
                <summary>Read immutable content</summary>
                <ImmutableContentPreview value={reflection} />
              </details>
              {selectedVersion.state === "draft" ? (
                <div className="confirmation-panel">
                  <label>
                    <input
                      checked={confirmSubmit}
                      onChange={(event) => setConfirmSubmit(event.currentTarget.checked)}
                      type="checkbox"
                    />
                    Submit exact version {selectedVersion.versionNumber} (
                    {shortHash(selectedVersion.payloadHash)}) for review. The stored version will
                    not be edited.
                  </label>
                  <button
                    className="primary-button"
                    disabled={!canSubmit || !confirmSubmit || pending}
                    onClick={() => {
                      void execute(
                        "submit-version",
                        `Version ${selectedVersion.versionNumber} submitted. Canonical state was reloaded.`,
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
                    Submit exact version
                  </button>
                </div>
              ) : null}
            </article>
          ) : (
            <p role="alert">The selected immutable payload does not match the accepted schema.</p>
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
      <h4>Production metadata</h4>
      <ul>
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
        <button className="secondary-button" disabled={!canCreate || pending} type="submit">
          Create immutable successor
        </button>
      </form>
    </details>
  );
}

function ReviewWorkspace({
  aal2,
  capabilities,
  execute,
  flow,
  organizationId,
  pending,
  selectedVersion,
  workspace,
}: {
  readonly aal2: boolean;
  readonly capabilities: Readonly<Record<string, boolean>> | null;
  readonly execute: ExecuteMutation;
  readonly flow: ReviewToPackageOperatorFlow;
  readonly organizationId: Uuid;
  readonly pending: boolean;
  readonly selectedVersion: TenantContentVersionSummary | undefined;
  readonly workspace: ReviewToPackageWorkspace;
}) {
  if (!selectedVersion) {
    return (
      <section className="workflow-section">
        <p>Select an immutable version before loading evidence and human-review actions.</p>
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

  return (
    <section className="workflow-section" aria-labelledby="review-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Steps 4–7</p>
          <h2 id="review-heading">Evidence, human review, approval, and package</h2>
        </div>
        <span className="status-pill status-pill--warning">Human authority</span>
      </div>
      <div className="exact-target">
        <strong>
          Exact version {selectedVersion.versionNumber} · {shortHash(selectedVersion.payloadHash)}
        </strong>
        <span>{selectedVersion.id}</span>
      </div>

      <AutomatedEvidence checkResults={checkResults} checkRuns={checkRuns} />

      <div className="human-governance-grid">
        <PolicyForm
          allowed={Boolean(capabilities?.["role.manage"]) && aal2}
          execute={execute}
          flow={flow}
          organizationId={organizationId}
          pending={pending}
        />
        <ScriptureEvidenceForm
          allowed={Boolean(capabilities?.["review.scripture"]) && aal2}
          execute={execute}
          flow={flow}
          organizationId={organizationId}
          pending={pending}
          versionId={versionId}
        />
        <RightsForm
          allowed={Boolean(capabilities?.["review.editorial"]) && aal2}
          execute={execute}
          flow={flow}
          organizationId={organizationId}
          pending={pending}
          versionId={versionId}
        />
        {(["scripture", "theology", "editorial"] as const).map((lane) => (
          <ReviewLaneForm
            allowed={Boolean(capabilities?.[`review.${lane}`]) && aal2}
            execute={execute}
            flow={flow}
            key={lane}
            lane={lane}
            organizationId={organizationId}
            pending={pending}
            versionId={versionId}
          />
        ))}
      </div>

      <CanonicalEvidenceSummary
        approvals={approvals}
        packages={packages}
        reviews={reviews}
        rightsSnapshots={rightsSnapshots}
        scriptureEvidence={scriptureEvidence}
      />

      <AuthorityActions
        aal2={aal2}
        approvals={activeApprovals}
        canApprove={Boolean(capabilities?.["approval.grant"])}
        canExport={Boolean(capabilities?.["export.request"])}
        canRevoke={Boolean(capabilities?.["approval.revoke"])}
        checkRuns={checkRuns}
        execute={execute}
        flow={flow}
        organizationId={organizationId}
        packages={packages}
        pending={pending}
        policies={workspace.reviewPolicies.filter(({ isActive }) => isActive)}
        reviews={reviews}
        rightsSnapshots={rightsSnapshots}
        scriptureEvidence={scriptureEvidence}
        version={selectedVersion}
      />
    </section>
  );
}

function AutomatedEvidence({
  checkResults,
  checkRuns,
}: {
  readonly checkResults: ReviewToPackageWorkspace["checkResults"];
  readonly checkRuns: ReviewToPackageWorkspace["checkRuns"];
}) {
  return (
    <section className="automated-evidence" aria-labelledby="automated-heading">
      <div>
        <p className="eyebrow">Automated evidence only</p>
        <h3 id="automated-heading">Checks cannot approve this version</h3>
        <p>
          These deterministic results may identify risk. Separate authorized humans still own
          Scripture, theology, editorial, rights, and approval decisions.
        </p>
      </div>
      {checkRuns.length === 0 ? (
        <p>No canonical check run exists for this exact version.</p>
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
    </section>
  );
}

function PolicyForm({ allowed, execute, flow, organizationId, pending }: HumanFormProps) {
  const [key, setKey] = useState("m1_3_default");
  const [version, setVersion] = useState(1);
  return (
    <HumanActionCard title="Activate review policy">
      <form
        className="workflow-form"
        onSubmit={submit(async () => {
          await execute(
            "review-policy",
            "Review policy activation completed. Canonical policy state was reloaded.",
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
        <button className="secondary-button" disabled={!allowed || pending} type="submit">
          Activate policy
        </button>
      </form>
    </HumanActionCard>
  );
}

function ScriptureEvidenceForm({
  allowed,
  execute,
  flow,
  organizationId,
  pending,
  versionId,
}: HumanFormProps & { readonly versionId: Uuid }) {
  const [reference, setReference] = useState("Synthetic Reference 1:1");
  const [translation, setTranslation] = useState("TEST");
  const [citation, setCitation] = useState("Synthetic fixture; not a Scripture quotation");
  return (
    <HumanActionCard title="Record Scripture evidence">
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
        <Field label="Reference" maxLength={160} onChange={setReference} value={reference} />
        <Field label="Translation" maxLength={80} onChange={setTranslation} value={translation} />
        <TextArea label="Source citation" maxLength={500} onChange={setCitation} value={citation} />
        <button className="secondary-button" disabled={!allowed || pending} type="submit">
          Record verified evidence
        </button>
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
  const [summary, setSummary] = useState("Synthetic material cleared for acceptance testing only");
  return (
    <HumanActionCard title="Record rights snapshot">
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
        <TextArea
          label="Rights source summary"
          maxLength={2000}
          onChange={setSummary}
          value={summary}
        />
        <button className="secondary-button" disabled={!allowed || pending} type="submit">
          Record cleared rights
        </button>
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
  const [decision, setDecision] = useState<ReviewDecision>("approved");
  const [evidence, setEvidence] = useState(`Synthetic ${lane} review evidence`);
  return (
    <HumanActionCard title={`${lane[0]?.toUpperCase()}${lane.slice(1)} review`}>
      <form
        className="workflow-form"
        onSubmit={submit(() =>
          execute(
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
          ),
        )}
      >
        <label>
          Human decision
          <select
            onChange={(event) => setDecision(event.currentTarget.value as ReviewDecision)}
            value={decision}
          >
            <option value="approved">Approved</option>
            <option value="changes_requested">Changes requested</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <TextArea
          label="Human evidence note"
          maxLength={2000}
          onChange={setEvidence}
          value={evidence}
        />
        <button className="secondary-button" disabled={!allowed || pending} type="submit">
          Record {lane} decision
        </button>
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

function AuthorityActions({
  aal2,
  approvals,
  canApprove,
  canExport,
  canRevoke,
  checkRuns,
  execute,
  flow,
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
  readonly organizationId: Uuid;
  readonly packages: ReviewToPackageWorkspace["productionPackages"];
  readonly pending: boolean;
  readonly policies: ReviewToPackageWorkspace["reviewPolicies"];
  readonly reviews: ReviewToPackageWorkspace["reviewDecisions"];
  readonly rightsSnapshots: ReviewToPackageWorkspace["rightsSnapshots"];
  readonly scriptureEvidence: ReviewToPackageWorkspace["scriptureEvidence"];
  readonly version: TenantContentVersionSummary;
}) {
  const { announce, reportWorkflowFailure } = useStudioSession();
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
  const selectedApproval = approvals.find(({ id }) => id === approvalId);
  const existingPackage = packages.find(
    ({ approvalSnapshotId }) => approvalId === approvalSnapshotId,
  );

  return (
    <div className="authority-grid">
      <section className="authority-card" aria-labelledby="approval-action-heading">
        <p className="eyebrow">AAL2 authority</p>
        <h3 id="approval-action-heading">Approve exact evidence bundle</h3>
        <p>
          Automated results are inputs only. PostgreSQL binds this submitted version to the exact
          policy, check run, evidence, rights, and three human decisions.
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
            label="Approved theology review"
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
        <label className="confirmation-label">
          <input
            checked={confirmApproval}
            onChange={(event) => setConfirmApproval(event.currentTarget.checked)}
            type="checkbox"
          />
          I confirm approval targets version {version.versionNumber}, payload{" "}
          {shortHash(version.payloadHash)}, and only the selected canonical evidence.
        </label>
        <button
          className="primary-button"
          disabled={!aal2 || !canApprove || !approvalComplete || !confirmApproval || pending}
          onClick={() => {
            void execute(
              "approve-version",
              `Version ${version.versionNumber} approval completed. Canonical authority was reloaded.`,
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
          Approve exact version
        </button>
      </section>

      <section className="authority-card" aria-labelledby="package-action-heading">
        <p className="eyebrow">Immutable, non-public</p>
        <h3 id="package-action-heading">Create production package</h3>
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
        {existingPackage ? (
          <>
            <p className="status-copy">
              Package already exists: {existingPackage.id} ·{" "}
              {shortHash(existingPackage.manifestHash)}.
            </p>
            <button
              className="secondary-button"
              onClick={() => {
                try {
                  downloadStrongrDailyPackage(existingPackage);
                  announce(
                    "Approved Strongr Daily JSON and Markdown package downloaded. No publishing occurred.",
                  );
                } catch (error) {
                  reportWorkflowFailure(
                    error,
                    "The approved Strongr Daily package was not downloaded",
                  );
                }
              }}
              type="button"
            >
              Download approved JSON and Markdown
            </button>
          </>
        ) : null}
        <label className="confirmation-label">
          <input
            checked={confirmPackage}
            onChange={(event) => setConfirmPackage(event.currentTarget.checked)}
            type="checkbox"
          />
          I confirm this creates an immutable package manifest only. It does not publish.
        </label>
        <button
          className="primary-button"
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
              "Immutable production package created. No publication occurred.",
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
          Create immutable package
        </button>
      </section>

      <section className="authority-card authority-card--danger" aria-labelledby="revoke-heading">
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
          I confirm this append-only revocation removes future authority from the exact approval.
        </label>
        <button
          className="danger-button"
          disabled={!aal2 || !canRevoke || !revocationApprovalId || !confirmRevocation || pending}
          onClick={() => {
            void execute(
              "revoke-approval",
              "Approval revocation recorded. Canonical authority was reloaded.",
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
      </section>
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
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}) {
  return (
    <article>
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
      <select onChange={(event) => onChange(event.currentTarget.value)} value={value}>
        {options.length === 0 ? <option value="">No eligible canonical record</option> : null}
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
