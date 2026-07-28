import type {
  JsonObject,
  JsonValue,
  MediaAccessibilityStatus,
  MediaOutputSpecSummary,
  MediaReviewDecision,
  MediaTranscriptStatus,
  TenantApprovalRevocationSummary,
  TenantMediaArtifactSummary,
  TenantMediaJobSummary,
  TenantMediaReviewSummary,
  TenantProductionPackageSummary,
  TenantStagedReleaseBundleSummary,
  TenantStagedReleaseRevocationSummary,
  Uuid,
  VerifiedMediaArtifactDownload,
} from "../../../packages/contracts/src/index.ts";

import type { StudioFoundation } from "./foundation.ts";

export interface MediaReleaseWorkspace {
  readonly approvalRevocations: readonly TenantApprovalRevocationSummary[];
  readonly artifacts: readonly TenantMediaArtifactSummary[];
  readonly jobs: readonly TenantMediaJobSummary[];
  readonly outputSpecs: readonly MediaOutputSpecSummary[];
  readonly productionPackages: readonly TenantProductionPackageSummary[];
  readonly reviews: readonly TenantMediaReviewSummary[];
  readonly stagedBundles: readonly TenantStagedReleaseBundleSummary[];
  readonly stagedRevocations: readonly TenantStagedReleaseRevocationSummary[];
}

function requireUuid(value: string, name: string): Uuid {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function requireReasonCode(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error("reason code is invalid");
  }
  return value;
}

function requireAdapterKey(value: string): string {
  if (!/^[a-z][a-z0-9_.-]*$/.test(value)) {
    throw new Error("adapter key is invalid");
  }
  return value;
}

function requireText(value: string, name: string, minimum: number, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return normalized;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return typeof value === "object" && Object.values(value).every(isJsonValue);
}

function requireObject(value: JsonObject, name: string, maximumBytes: number): JsonObject {
  if (!isJsonValue(value) || Array.isArray(value)) {
    throw new Error(`${name} is invalid`);
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maximumBytes) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function requireReviewDecision(value: MediaReviewDecision): MediaReviewDecision {
  if (!["approved", "changes_requested", "rejected"].includes(value)) {
    throw new Error("media review decision is invalid");
  }
  return value;
}

function requireTranscriptStatus(value: MediaTranscriptStatus): MediaTranscriptStatus {
  if (!["ready", "blocked"].includes(value)) {
    throw new Error("transcript status is invalid");
  }
  return value;
}

function requireAccessibilityStatus(value: MediaAccessibilityStatus): MediaAccessibilityStatus {
  if (!["approved", "blocked"].includes(value)) {
    throw new Error("accessibility status is invalid");
  }
  return value;
}

export class MediaReleaseOperatorFlow {
  readonly #foundation: StudioFoundation;

  constructor(foundation: StudioFoundation) {
    if (!foundation.mediaReads) {
      throw new Error("authenticated media reads are unavailable");
    }
    this.#foundation = foundation;
  }

  async loadWorkspace(organizationId: Uuid, limit = 50): Promise<MediaReleaseWorkspace> {
    const tenantId = requireUuid(organizationId, "organization id");
    const mediaReads = this.#foundation.mediaReads;
    if (!mediaReads) {
      throw new Error("authenticated media reads are unavailable");
    }
    const [
      productionPackages,
      approvalRevocations,
      outputSpecs,
      jobs,
      artifacts,
      reviews,
      stagedBundles,
      stagedRevocations,
    ] = await Promise.all([
      this.#foundation.reads.listProductionPackages(tenantId, limit),
      this.#foundation.reads.listApprovalRevocations(tenantId, limit),
      mediaReads.listMediaOutputSpecs(limit),
      mediaReads.listMediaJobs(tenantId, limit),
      mediaReads.listMediaArtifacts(tenantId, limit),
      mediaReads.listMediaReviews(tenantId, limit),
      mediaReads.listStagedReleaseBundles(tenantId, limit),
      mediaReads.listStagedReleaseRevocations(tenantId, limit),
    ]);
    return Object.freeze({
      approvalRevocations,
      artifacts,
      jobs,
      outputSpecs,
      productionPackages,
      reviews,
      stagedBundles,
      stagedRevocations,
    });
  }

  async requestMedia(input: {
    readonly adapterKey: string;
    readonly adapterVersion: string;
    readonly correlationId: Uuid;
    readonly idempotencyKey: string;
    readonly organizationId: Uuid;
    readonly outputSpecId: Uuid;
    readonly productionPackageId: Uuid;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m2_request_media", {
      adapterKey: requireAdapterKey(input.adapterKey),
      adapterVersion: requireText(input.adapterVersion, "adapter version", 1, 100),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      idempotencyKey: requireText(input.idempotencyKey, "idempotency key", 8, 255),
      organizationId: requireUuid(input.organizationId, "organization id"),
      outputSpecId: requireUuid(input.outputSpecId, "output spec id"),
      productionPackageId: requireUuid(input.productionPackageId, "production package id"),
    });
  }

  async downloadArtifact(
    organizationId: Uuid,
    mediaArtifactId: Uuid,
  ): Promise<VerifiedMediaArtifactDownload> {
    const mediaReads = this.#foundation.mediaReads;
    if (!mediaReads) {
      throw new Error("authenticated media reads are unavailable");
    }
    return mediaReads.downloadMediaArtifact(
      requireUuid(organizationId, "organization id"),
      requireUuid(mediaArtifactId, "media artifact id"),
    );
  }

  async recordReview(input: {
    readonly accessibilityStatus: MediaAccessibilityStatus;
    readonly correlationId: Uuid;
    readonly decision: MediaReviewDecision;
    readonly evidence: JsonObject;
    readonly mediaArtifactId: Uuid;
    readonly organizationId: Uuid;
    readonly reasonCode: string;
    readonly transcriptStatus: MediaTranscriptStatus;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m2_record_media_review", {
      accessibilityStatus: requireAccessibilityStatus(input.accessibilityStatus),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      decision: requireReviewDecision(input.decision),
      evidence: requireObject(input.evidence, "media review evidence", 65_536),
      mediaArtifactId: requireUuid(input.mediaArtifactId, "media artifact id"),
      organizationId: requireUuid(input.organizationId, "organization id"),
      reasonCode: requireReasonCode(input.reasonCode),
      transcriptStatus: requireTranscriptStatus(input.transcriptStatus),
    });
  }

  async stageRelease(input: {
    readonly configuration: JsonObject;
    readonly correlationId: Uuid;
    readonly mediaArtifactId: Uuid;
    readonly mediaReviewId: Uuid;
    readonly organizationId: Uuid;
    readonly productionPackageId: Uuid;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m2_stage_release", {
      configuration: requireObject(input.configuration, "release configuration", 32_768),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      mediaArtifactId: requireUuid(input.mediaArtifactId, "media artifact id"),
      mediaReviewId: requireUuid(input.mediaReviewId, "media review id"),
      organizationId: requireUuid(input.organizationId, "organization id"),
      productionPackageId: requireUuid(input.productionPackageId, "production package id"),
    });
  }

  async revokeStagedRelease(input: {
    readonly correlationId: Uuid;
    readonly organizationId: Uuid;
    readonly reasonCode: string;
    readonly stagedReleaseBundleId: Uuid;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m2_revoke_staged_release", {
      correlationId: requireUuid(input.correlationId, "correlation id"),
      organizationId: requireUuid(input.organizationId, "organization id"),
      reasonCode: requireReasonCode(input.reasonCode),
      stagedReleaseBundleId: requireUuid(input.stagedReleaseBundleId, "staged release bundle id"),
    });
  }
}

export function createMediaReleaseOperatorFlow(
  foundation: StudioFoundation,
): MediaReleaseOperatorFlow {
  return new MediaReleaseOperatorFlow(foundation);
}
