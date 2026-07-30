export type Uuid = string;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export const browserCommands = Object.freeze({
  approveVersion: "m1_approve_version",
  createAudioBrief: "m1_create_audio_brief",
  createManualVersion: "m1_create_manual_version",
  createProductionPackage: "m1_create_production_package",
  createReviewPolicy: "m1_create_review_policy",
  recordReview: "m1_record_review",
  recordRightsSnapshot: "m1_record_rights_snapshot",
  recordScriptureEvidence: "m1_record_scripture_evidence",
  recordMediaReview: "m2_record_media_review",
  requestGeneration: "m1_request_generation",
  requestMedia: "m2_request_media",
  revokeApproval: "m1_revoke_approval",
  revokeStagedRelease: "m2_revoke_staged_release",
  stageRelease: "m2_stage_release",
  submitVersion: "m1_submit_version",
} as const);

export const workerCommands = Object.freeze({
  acknowledgeOutboxEvent: "m0_ack_outbox_event",
  beginGenerationAttempt: "m1_begin_generation_attempt",
  claimGenerationEvents: "m1_claim_generation_events",
  completeGenerationAttempt: "m1_complete_generation_attempt",
  failGenerationAttempt: "m1_fail_generation_attempt",
  failOutboxEvent: "m0_fail_outbox_event",
  heartbeat: "m0_heartbeat_worker",
  recordCheckRun: "m1_record_check_run",
  beginMediaAttempt: "m2_begin_media_attempt",
  claimMediaEvents: "m2_claim_media_events",
  completeMediaAttempt: "m2_complete_media_attempt",
  failMediaAttempt: "m2_fail_media_attempt",
  recordMediaReconciliation: "m2_record_media_reconciliation",
} as const);

export interface CreateAudioBriefArguments {
  readonly organizationId: Uuid;
  readonly title: string;
  readonly payload: JsonValue;
  readonly correlationId: Uuid;
}

export interface RequestGenerationArguments {
  readonly organizationId: Uuid;
  readonly briefId: Uuid;
  readonly promptKey: string;
  readonly promptVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId: Uuid;
}

export interface CreateManualVersionArguments {
  readonly organizationId: Uuid;
  readonly contentItemId: Uuid;
  readonly briefId: Uuid;
  readonly payload: JsonValue;
  readonly supersedesVersionId: Uuid | null;
  readonly correlationId: Uuid;
}

export interface SubmitVersionArguments {
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly correlationId: Uuid;
}

export interface CreateReviewPolicyArguments {
  readonly organizationId: Uuid;
  readonly key: string;
  readonly version: number;
  readonly correlationId: Uuid;
}

export type ScriptureVerificationStatus = "verified" | "blocked";

export interface RecordScriptureEvidenceArguments {
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly reference: string;
  readonly translation: string;
  readonly sourceCitation: string;
  readonly verificationStatus: ScriptureVerificationStatus;
  readonly correlationId: Uuid;
}

export type RightsStatus = "cleared" | "blocked";

export interface RecordRightsSnapshotArguments {
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly status: RightsStatus;
  readonly sourceSummary: string;
  readonly correlationId: Uuid;
}

export type ReviewLane = "scripture" | "theology" | "editorial";
export type ReviewDecision = "approved" | "changes_requested" | "rejected";

export interface RecordReviewArguments {
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly lane: ReviewLane;
  readonly decision: ReviewDecision;
  readonly reasonCode: string;
  readonly evidence: JsonObject;
  readonly correlationId: Uuid;
}

export interface ApproveVersionArguments {
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly reviewPolicyId: Uuid;
  readonly checkRunId: Uuid;
  readonly scriptureEvidenceId: Uuid;
  readonly rightsSnapshotId: Uuid;
  readonly scriptureReviewId: Uuid;
  readonly theologyReviewId: Uuid;
  readonly editorialReviewId: Uuid;
  readonly reasonCode: string;
  readonly correlationId: Uuid;
}

export interface RevokeApprovalArguments {
  readonly organizationId: Uuid;
  readonly approvalSnapshotId: Uuid;
  readonly reasonCode: string;
  readonly correlationId: Uuid;
}

export interface CreateProductionPackageArguments {
  readonly organizationId: Uuid;
  readonly approvalSnapshotId: Uuid;
  readonly correlationId: Uuid;
}

export interface RequestMediaArguments {
  readonly organizationId: Uuid;
  readonly productionPackageId: Uuid;
  readonly outputSpecId: Uuid;
  readonly adapterKey: string;
  readonly adapterVersion: string;
  readonly idempotencyKey: string;
  readonly correlationId: Uuid;
}

export interface RecordMediaReviewArguments {
  readonly organizationId: Uuid;
  readonly mediaArtifactId: Uuid;
  readonly decision: MediaReviewDecision;
  readonly transcriptStatus: MediaTranscriptStatus;
  readonly accessibilityStatus: MediaAccessibilityStatus;
  readonly reasonCode: string;
  readonly evidence: JsonObject;
  readonly correlationId: Uuid;
}

export interface StageReleaseArguments {
  readonly organizationId: Uuid;
  readonly productionPackageId: Uuid;
  readonly mediaArtifactId: Uuid;
  readonly mediaReviewId: Uuid;
  readonly configuration: JsonObject;
  readonly correlationId: Uuid;
}

export interface RevokeStagedReleaseArguments {
  readonly organizationId: Uuid;
  readonly stagedReleaseBundleId: Uuid;
  readonly reasonCode: string;
  readonly correlationId: Uuid;
}

export interface BrowserCommandArguments {
  readonly m1_approve_version: ApproveVersionArguments;
  readonly m1_create_audio_brief: CreateAudioBriefArguments;
  readonly m1_create_manual_version: CreateManualVersionArguments;
  readonly m1_create_production_package: CreateProductionPackageArguments;
  readonly m1_create_review_policy: CreateReviewPolicyArguments;
  readonly m1_record_review: RecordReviewArguments;
  readonly m1_record_rights_snapshot: RecordRightsSnapshotArguments;
  readonly m1_record_scripture_evidence: RecordScriptureEvidenceArguments;
  readonly m1_request_generation: RequestGenerationArguments;
  readonly m1_revoke_approval: RevokeApprovalArguments;
  readonly m1_submit_version: SubmitVersionArguments;
  readonly m2_record_media_review: RecordMediaReviewArguments;
  readonly m2_request_media: RequestMediaArguments;
  readonly m2_revoke_staged_release: RevokeStagedReleaseArguments;
  readonly m2_stage_release: StageReleaseArguments;
}

export interface CreateAudioBriefResult {
  readonly contentItemId: Uuid;
  readonly briefId: Uuid;
}

export interface BrowserCommandResults {
  readonly m1_approve_version: Uuid;
  readonly m1_create_audio_brief: CreateAudioBriefResult;
  readonly m1_create_manual_version: Uuid;
  readonly m1_create_production_package: Uuid;
  readonly m1_create_review_policy: Uuid;
  readonly m1_record_review: Uuid;
  readonly m1_record_rights_snapshot: Uuid;
  readonly m1_record_scripture_evidence: Uuid;
  readonly m1_request_generation: Uuid;
  readonly m1_revoke_approval: Uuid;
  readonly m1_submit_version: undefined;
  readonly m2_record_media_review: Uuid;
  readonly m2_request_media: Uuid;
  readonly m2_revoke_staged_release: Uuid;
  readonly m2_stage_release: Uuid;
}

export type BrowserCommandName = keyof BrowserCommandArguments;
export type BrowserCommandResult<Name extends BrowserCommandName> = BrowserCommandResults[Name];

export interface TenantBriefSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly contentItemId: Uuid;
  readonly schemaId:
    | "strongr.audio_reflection_brief.v1"
    | "strongr.strongr_daily_audio_reflection_brief.v2";
  readonly payloadHash: string;
  readonly createdAt: string;
}

export type GenerationJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead_letter"
  | "cancelled";

export interface TenantGenerationJobSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly briefId: Uuid;
  readonly state: GenerationJobState;
  readonly attemptCount: number;
  readonly outputHash: string | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export type ContentVersionState = "draft" | "submitted" | "superseded";
export type ContentVersionSource = "manual" | "ai_assisted";

export interface TenantContentVersionSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly contentItemId: Uuid;
  readonly briefId: Uuid;
  readonly versionNumber: number;
  readonly schemaId: "strongr.audio_reflection.v1" | "strongr.strongr_daily_audio_reflection.v2";
  readonly payload: JsonValue;
  readonly payloadHash: string;
  readonly source: ContentVersionSource;
  readonly sourceJobId: Uuid | null;
  readonly state: ContentVersionState;
  readonly createdAt: string;
  readonly submittedAt: string | null;
}

export type CheckDefinitionLane =
  | "scripture"
  | "pastoral"
  | "editorial"
  | "rights"
  | "accessibility"
  | "narration";
export type CheckOutcome = "pass" | "warn" | "fail" | "error";
export type CheckRunStatus = "completed" | "failed";

export interface CheckDefinitionSummary {
  readonly id: Uuid;
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly lane: CheckDefinitionLane;
  readonly blocksApproval: boolean;
}

export interface TenantCheckRunSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly engineKey: string;
  readonly engineVersion: string;
  readonly status: CheckRunStatus;
  readonly artifactHash: string;
  readonly correlationId: Uuid;
  readonly createdAt: string;
}

export interface TenantCheckResultSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly checkRunId: Uuid;
  readonly checkDefinitionId: Uuid;
  readonly outcome: CheckOutcome;
  readonly detailCode: string;
  readonly evidence: JsonObject;
  readonly createdAt: string;
}

export interface TenantScriptureEvidenceSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly reference: string;
  readonly translation: string;
  readonly sourceCitation: string;
  readonly verificationStatus: ScriptureVerificationStatus;
  readonly evidenceHash: string;
  readonly createdAt: string;
}

export interface TenantRightsSnapshotSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly status: RightsStatus;
  readonly sourceSummary: string;
  readonly snapshotHash: string;
  readonly createdAt: string;
}

export interface TenantReviewPolicySummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly key: string;
  readonly version: number;
  readonly policyHash: string;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface TenantReviewDecisionSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly lane: ReviewLane;
  readonly decision: ReviewDecision;
  readonly reasonCode: string;
  readonly evidence: JsonObject;
  readonly createdAt: string;
}

export interface TenantApprovalSnapshotSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly reviewPolicyId: Uuid;
  readonly checkRunId: Uuid;
  readonly scriptureEvidenceId: Uuid;
  readonly rightsSnapshotId: Uuid;
  readonly versionPayloadHash: string;
  readonly evidenceBundleHash: string;
  readonly authenticationAssurance: "aal2";
  readonly reasonCode: string;
  readonly approvedAt: string;
}

export interface TenantApprovalRevocationSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly approvalSnapshotId: Uuid;
  readonly reasonCode: string;
  readonly revokedAt: string;
}

export interface TenantProductionPackageSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly approvalSnapshotId: Uuid;
  readonly manifestSchemaId: "strongr.production_package.v1";
  readonly manifest: JsonObject;
  readonly manifestHash: string;
  readonly createdAt: string;
}

export const mediaStorageContract = Object.freeze({
  allowedMimeTypes: ["audio/wav"] as const,
  bucketId: "strongr-os-media",
  maxBytes: 26_214_400,
  public: false,
} as const);

export type MediaJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead_letter"
  | "cancelled";
export type MediaReviewDecision = "approved" | "changes_requested" | "rejected";
export type MediaTranscriptStatus = "ready" | "blocked";
export type MediaAccessibilityStatus = "approved" | "blocked";
export type MediaReconciliationEventType =
  | "upload_ambiguous"
  | "object_missing"
  | "object_orphaned"
  | "checksum_mismatch"
  | "reconciled";
export type MediaReconciliationOutcome = "detected" | "verified" | "blocked";

export interface MediaOutputSpecSummary {
  readonly id: Uuid;
  readonly key: "strongr.synthetic_audio";
  readonly version: 1;
  readonly mediaKind: "audio";
  readonly container: "wav";
  readonly codec: "pcm_s16le";
  readonly mimeType: "audio/wav";
  readonly channels: 1;
  readonly sampleRateHz: 16_000;
  readonly bitsPerSample: 16;
  readonly maxDurationMs: 900_000;
  readonly maxBytes: 26_214_400;
  readonly specHash: string;
  readonly createdAt: string;
}

export interface TenantMediaJobSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly productionPackageId: Uuid;
  readonly outputSpecId: Uuid;
  readonly requestedByMembershipId: Uuid;
  readonly adapterKey: string;
  readonly adapterVersion: string;
  readonly requestSchemaId: "strongr.media_request.v1";
  readonly inputHash: string;
  readonly correlationId: Uuid;
  readonly state: MediaJobState;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly availableAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly lastErrorCode: string | null;
  readonly createdAt: string;
}

export interface TenantMediaArtifactSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly mediaJobId: Uuid;
  readonly productionPackageId: Uuid;
  readonly outputSpecId: Uuid;
  readonly successfulAttemptId: Uuid;
  readonly bucketId: "strongr-os-media";
  readonly objectPath: string;
  readonly mimeType: "audio/wav";
  readonly container: "wav";
  readonly codec: "pcm_s16le";
  readonly channels: 1;
  readonly sampleRateHz: 16_000;
  readonly bitsPerSample: 16;
  readonly durationMs: number;
  readonly byteCount: number;
  readonly sha256: string;
  readonly validationSchemaId: "strongr.media_validation.v1";
  readonly validatedAt: string;
  readonly createdAt: string;
}

export interface TenantMediaReviewSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly mediaArtifactId: Uuid;
  readonly reviewerMembershipId: Uuid;
  readonly decision: MediaReviewDecision;
  readonly transcriptStatus: MediaTranscriptStatus;
  readonly accessibilityStatus: MediaAccessibilityStatus;
  readonly reasonCode: string;
  readonly evidence: JsonObject;
  readonly evidenceHash: string;
  readonly createdAt: string;
}

export interface TenantStagedReleaseBundleSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly productionPackageId: Uuid;
  readonly mediaArtifactId: Uuid;
  readonly mediaReviewId: Uuid;
  readonly manifestSchemaId: "strongr.staged_release_bundle.v1";
  readonly manifest: JsonObject;
  readonly manifestHash: string;
  readonly stagedByMembershipId: Uuid;
  readonly authenticationAssurance: "aal2";
  readonly stagedAt: string;
}

export interface TenantStagedReleaseRevocationSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly stagedReleaseBundleId: Uuid;
  readonly revokedByMembershipId: Uuid;
  readonly reasonCode: string;
  readonly authenticationAssurance: "aal2";
  readonly revokedAt: string;
}

export interface TenantReadGateway {
  listBriefs(organizationId: Uuid, limit?: number): Promise<readonly TenantBriefSummary[]>;
  listCheckDefinitions(limit?: number): Promise<readonly CheckDefinitionSummary[]>;
  listCheckResults(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantCheckResultSummary[]>;
  listCheckRuns(organizationId: Uuid, limit?: number): Promise<readonly TenantCheckRunSummary[]>;
  listGenerationJobs(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantGenerationJobSummary[]>;
  listContentVersions(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantContentVersionSummary[]>;
  listScriptureEvidence(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantScriptureEvidenceSummary[]>;
  listRightsSnapshots(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantRightsSnapshotSummary[]>;
  listReviewPolicies(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantReviewPolicySummary[]>;
  listReviewDecisions(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantReviewDecisionSummary[]>;
  listApprovalSnapshots(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantApprovalSnapshotSummary[]>;
  listApprovalRevocations(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantApprovalRevocationSummary[]>;
  listProductionPackages(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantProductionPackageSummary[]>;
}

export interface M2TenantReadGateway {
  getMediaArtifact(
    organizationId: Uuid,
    mediaArtifactId: Uuid,
  ): Promise<TenantMediaArtifactSummary>;
  downloadMediaArtifact(
    organizationId: Uuid,
    mediaArtifactId: Uuid,
  ): Promise<VerifiedMediaArtifactDownload>;
  listMediaOutputSpecs(limit?: number): Promise<readonly MediaOutputSpecSummary[]>;
  listMediaJobs(organizationId: Uuid, limit?: number): Promise<readonly TenantMediaJobSummary[]>;
  listMediaArtifacts(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantMediaArtifactSummary[]>;
  listMediaReviews(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantMediaReviewSummary[]>;
  listStagedReleaseBundles(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantStagedReleaseBundleSummary[]>;
  listStagedReleaseRevocations(
    organizationId: Uuid,
    limit?: number,
  ): Promise<readonly TenantStagedReleaseRevocationSummary[]>;
}

export interface VerifiedMediaArtifactDownload {
  readonly artifact: TenantMediaArtifactSummary;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

export interface AutomatedCheckResultInput {
  readonly checkDefinitionId: Uuid;
  readonly outcome: CheckOutcome;
  readonly detailCode: string;
  readonly evidence: JsonObject;
}

export interface RecordCheckRunArguments {
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly engineKey: string;
  readonly engineVersion: string;
  readonly status: CheckRunStatus;
  readonly results: readonly AutomatedCheckResultInput[];
  readonly correlationId: Uuid;
}

export interface ContentGenerationRequestedV1 {
  readonly eventId: Uuid;
  readonly organizationId: Uuid;
  readonly eventType: "content.generation_requested.v1";
  readonly eventVersion: 1;
  readonly aggregateType: "generation_job";
  readonly aggregateId: Uuid;
  readonly payload: {
    readonly job_id: Uuid;
  };
  readonly correlationId: Uuid;
  readonly attemptNumber: number;
  readonly leaseToken: Uuid;
  readonly leaseExpiresAt: string;
}
