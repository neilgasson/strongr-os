import type {
  CheckDefinitionSummary,
  JsonObject,
  JsonValue,
  ReviewDecision,
  ReviewLane,
  RightsStatus,
  ScriptureVerificationStatus,
  TenantApprovalRevocationSummary,
  TenantApprovalSnapshotSummary,
  TenantCheckResultSummary,
  TenantCheckRunSummary,
  TenantProductionPackageSummary,
  TenantReviewDecisionSummary,
  TenantReviewPolicySummary,
  TenantRightsSnapshotSummary,
  TenantScriptureEvidenceSummary,
  Uuid,
} from "../../../packages/contracts/src/index.ts";

import type { StudioFoundation } from "./foundation.ts";

export interface ReviewToPackageWorkspace {
  readonly checkDefinitions: readonly CheckDefinitionSummary[];
  readonly checkRuns: readonly TenantCheckRunSummary[];
  readonly checkResults: readonly TenantCheckResultSummary[];
  readonly scriptureEvidence: readonly TenantScriptureEvidenceSummary[];
  readonly rightsSnapshots: readonly TenantRightsSnapshotSummary[];
  readonly reviewPolicies: readonly TenantReviewPolicySummary[];
  readonly reviewDecisions: readonly TenantReviewDecisionSummary[];
  readonly approvalSnapshots: readonly TenantApprovalSnapshotSummary[];
  readonly approvalRevocations: readonly TenantApprovalRevocationSummary[];
  readonly productionPackages: readonly TenantProductionPackageSummary[];
}

export interface ApproveVersionInput {
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

function requireUuid(value: string, name: string): Uuid {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function requireText(value: string, name: string, maximum: number): string {
  const text = value.trim();
  if (text.length < 1 || text.length > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return text;
}

function requireReasonCode(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error("reason code is invalid");
  }
  return value;
}

function requirePolicyKey(value: string): string {
  if (!/^[a-z][a-z0-9_.-]*$/.test(value)) {
    throw new Error("review policy key is invalid");
  }
  return value;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return typeof value === "object" && Object.values(value).every((entry) => isJsonValue(entry));
}

function requireEvidence(value: JsonObject): JsonObject {
  if (!isJsonValue(value) || Array.isArray(value)) {
    throw new Error("review evidence is invalid");
  }
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > 65_536) {
    throw new Error("review evidence is invalid");
  }
  return value;
}

function requireLane(value: ReviewLane): ReviewLane {
  if (!["scripture", "theology", "editorial"].includes(value)) {
    throw new Error("review lane is invalid");
  }
  return value;
}

function requireDecision(value: ReviewDecision): ReviewDecision {
  if (!["approved", "changes_requested", "rejected"].includes(value)) {
    throw new Error("review decision is invalid");
  }
  return value;
}

function requireScriptureStatus(value: ScriptureVerificationStatus): ScriptureVerificationStatus {
  if (!["verified", "blocked"].includes(value)) {
    throw new Error("Scripture verification status is invalid");
  }
  return value;
}

function requireRightsStatus(value: RightsStatus): RightsStatus {
  if (!["cleared", "blocked"].includes(value)) {
    throw new Error("rights status is invalid");
  }
  return value;
}

export class ReviewToPackageOperatorFlow {
  readonly #foundation: StudioFoundation;

  constructor(foundation: StudioFoundation) {
    this.#foundation = foundation;
  }

  async loadWorkspace(organizationId: Uuid, limit = 50): Promise<ReviewToPackageWorkspace> {
    const tenantId = requireUuid(organizationId, "organization id");
    const [
      checkDefinitions,
      checkRuns,
      checkResults,
      scriptureEvidence,
      rightsSnapshots,
      reviewPolicies,
      reviewDecisions,
      approvalSnapshots,
      approvalRevocations,
      productionPackages,
    ] = await Promise.all([
      this.#foundation.reads.listCheckDefinitions(limit),
      this.#foundation.reads.listCheckRuns(tenantId, limit),
      this.#foundation.reads.listCheckResults(tenantId, limit),
      this.#foundation.reads.listScriptureEvidence(tenantId, limit),
      this.#foundation.reads.listRightsSnapshots(tenantId, limit),
      this.#foundation.reads.listReviewPolicies(tenantId, limit),
      this.#foundation.reads.listReviewDecisions(tenantId, limit),
      this.#foundation.reads.listApprovalSnapshots(tenantId, limit),
      this.#foundation.reads.listApprovalRevocations(tenantId, limit),
      this.#foundation.reads.listProductionPackages(tenantId, limit),
    ]);
    return Object.freeze({
      approvalRevocations,
      approvalSnapshots,
      checkDefinitions,
      checkResults,
      checkRuns,
      productionPackages,
      reviewDecisions,
      reviewPolicies,
      rightsSnapshots,
      scriptureEvidence,
    });
  }

  async activateReviewPolicy(input: {
    readonly organizationId: Uuid;
    readonly key: string;
    readonly version: number;
    readonly correlationId: Uuid;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m1_create_review_policy", {
      correlationId: requireUuid(input.correlationId, "correlation id"),
      key: requirePolicyKey(input.key),
      organizationId: requireUuid(input.organizationId, "organization id"),
      version: requirePositiveInteger(input.version, "review policy version"),
    });
  }

  async recordScriptureEvidence(input: {
    readonly organizationId: Uuid;
    readonly contentVersionId: Uuid;
    readonly reference: string;
    readonly translation: string;
    readonly sourceCitation: string;
    readonly verificationStatus: ScriptureVerificationStatus;
    readonly correlationId: Uuid;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m1_record_scripture_evidence", {
      contentVersionId: requireUuid(input.contentVersionId, "content version id"),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      organizationId: requireUuid(input.organizationId, "organization id"),
      reference: requireText(input.reference, "Scripture reference", 160),
      sourceCitation: requireText(input.sourceCitation, "Scripture source citation", 500),
      translation: requireText(input.translation, "Scripture translation", 80),
      verificationStatus: requireScriptureStatus(input.verificationStatus),
    });
  }

  async recordRightsSnapshot(input: {
    readonly organizationId: Uuid;
    readonly contentVersionId: Uuid;
    readonly status: RightsStatus;
    readonly sourceSummary: string;
    readonly correlationId: Uuid;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m1_record_rights_snapshot", {
      contentVersionId: requireUuid(input.contentVersionId, "content version id"),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      organizationId: requireUuid(input.organizationId, "organization id"),
      sourceSummary: requireText(input.sourceSummary, "rights source summary", 2_000),
      status: requireRightsStatus(input.status),
    });
  }

  async recordReview(input: {
    readonly organizationId: Uuid;
    readonly contentVersionId: Uuid;
    readonly lane: ReviewLane;
    readonly decision: ReviewDecision;
    readonly reasonCode: string;
    readonly evidence: JsonObject;
    readonly correlationId: Uuid;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m1_record_review", {
      contentVersionId: requireUuid(input.contentVersionId, "content version id"),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      decision: requireDecision(input.decision),
      evidence: requireEvidence(input.evidence),
      lane: requireLane(input.lane),
      organizationId: requireUuid(input.organizationId, "organization id"),
      reasonCode: requireReasonCode(input.reasonCode),
    });
  }

  async approveVersion(input: ApproveVersionInput): Promise<Uuid> {
    return this.#foundation.commands.invoke("m1_approve_version", {
      checkRunId: requireUuid(input.checkRunId, "check run id"),
      contentVersionId: requireUuid(input.contentVersionId, "content version id"),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      editorialReviewId: requireUuid(input.editorialReviewId, "editorial review id"),
      organizationId: requireUuid(input.organizationId, "organization id"),
      reasonCode: requireReasonCode(input.reasonCode),
      reviewPolicyId: requireUuid(input.reviewPolicyId, "review policy id"),
      rightsSnapshotId: requireUuid(input.rightsSnapshotId, "rights snapshot id"),
      scriptureEvidenceId: requireUuid(input.scriptureEvidenceId, "Scripture evidence id"),
      scriptureReviewId: requireUuid(input.scriptureReviewId, "Scripture review id"),
      theologyReviewId: requireUuid(input.theologyReviewId, "theology review id"),
    });
  }

  async revokeApproval(input: {
    readonly organizationId: Uuid;
    readonly approvalSnapshotId: Uuid;
    readonly reasonCode: string;
    readonly correlationId: Uuid;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m1_revoke_approval", {
      approvalSnapshotId: requireUuid(input.approvalSnapshotId, "approval snapshot id"),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      organizationId: requireUuid(input.organizationId, "organization id"),
      reasonCode: requireReasonCode(input.reasonCode),
    });
  }

  async createProductionPackage(input: {
    readonly organizationId: Uuid;
    readonly approvalSnapshotId: Uuid;
    readonly correlationId: Uuid;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m1_create_production_package", {
      approvalSnapshotId: requireUuid(input.approvalSnapshotId, "approval snapshot id"),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      organizationId: requireUuid(input.organizationId, "organization id"),
    });
  }
}

export function createReviewToPackageOperatorFlow(
  foundation: StudioFoundation,
): ReviewToPackageOperatorFlow {
  return new ReviewToPackageOperatorFlow(foundation);
}
