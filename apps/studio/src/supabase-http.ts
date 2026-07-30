import type {
  BrowserCommandArguments,
  BrowserCommandName,
  BrowserCommandResult,
  CheckDefinitionLane,
  CheckDefinitionSummary,
  CheckOutcome,
  CheckRunStatus,
  ContentVersionSource,
  ContentVersionState,
  GenerationJobState,
  JsonObject,
  JsonValue,
  MediaAccessibilityStatus,
  MediaJobState,
  MediaOutputSpecSummary,
  MediaReviewDecision,
  MediaTranscriptStatus,
  ReviewDecision,
  ReviewLane,
  RightsStatus,
  ScriptureVerificationStatus,
  TenantApprovalRevocationSummary,
  TenantApprovalSnapshotSummary,
  TenantBriefSummary,
  TenantCheckResultSummary,
  TenantCheckRunSummary,
  TenantContentVersionSummary,
  TenantGenerationJobSummary,
  TenantMediaArtifactSummary,
  TenantMediaJobSummary,
  TenantMediaReviewSummary,
  TenantProductionPackageSummary,
  TenantReviewDecisionSummary,
  TenantReviewPolicySummary,
  TenantRightsSnapshotSummary,
  TenantScriptureEvidenceSummary,
  TenantStagedReleaseBundleSummary,
  TenantStagedReleaseRevocationSummary,
  Uuid,
  VerifiedMediaArtifactDownload,
} from "../../../packages/contracts/src/index.ts";

import type { StudioEnvironment } from "./environment.ts";
import type { StudioCommandGateway } from "./foundation.ts";

export type StudioFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type UnknownRecord = Readonly<Record<string, unknown>>;

export class StudioApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string) {
    super(`Studio API request failed (${status}:${code})`);
    this.name = "StudioApiError";
    this.status = status;
    this.code = code;
  }
}

function requireRecord(value: unknown, name: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${name} response`);
  }
  return value as UnknownRecord;
}

function requireTenantRow(value: unknown, name: string, organizationId: Uuid): UnknownRecord {
  const row = requireRecord(value, name);
  if (requireUuid(row, "organization_id") !== organizationId) {
    throw new Error(`Invalid tenant ${name} response`);
  }
  return row;
}

function requireString(record: UnknownRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireNullableString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  return requireString(record, key);
}

function requireInteger(record: UnknownRecord, key: string): number {
  const value = record[key];
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value as number;
}

function requireBoolean(record: UnknownRecord, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireUuid(record: UnknownRecord, key: string): Uuid {
  const value = requireString(record, key);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireNullableUuid(record: UnknownRecord, key: string): Uuid | null {
  const value = requireNullableString(record, key);
  if (value === null) {
    return null;
  }
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireHash(record: UnknownRecord, key: string): string {
  const value = requireString(record, key);
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireNullableHash(record: UnknownRecord, key: string): string | null {
  const value = requireNullableString(record, key);
  if (value === null) {
    return null;
  }
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireJsonValue(value: unknown, key: string): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => requireJsonValue(item, key));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, item]) => [entryKey, requireJsonValue(item, key)]),
    );
  }
  throw new Error(`Invalid Studio API field: ${key}`);
}

function requireJsonObject(value: unknown, key: string): JsonObject {
  const result = requireJsonValue(value, key);
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return result;
}

function requireOneOf<const Value extends string>(
  record: UnknownRecord,
  key: string,
  allowed: readonly Value[],
): Value {
  const value = requireString(record, key);
  if (!allowed.includes(value as Value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value as Value;
}

function requireLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("Studio read limit must be between 1 and 100");
  }
  return value;
}

function requireAccessToken(value: string): string {
  const token = value.trim();
  if (!token || token.startsWith("sb_")) {
    throw new Error("Studio requires an authenticated user access token");
  }
  return token;
}

function commandBody<Name extends BrowserCommandName>(
  command: Name,
  arguments_: BrowserCommandArguments[Name],
): UnknownRecord {
  switch (command) {
    case "m1_approve_version": {
      const input = arguments_ as BrowserCommandArguments["m1_approve_version"];
      return {
        p_check_run_id: input.checkRunId,
        p_content_version_id: input.contentVersionId,
        p_correlation_id: input.correlationId,
        p_editorial_review_id: input.editorialReviewId,
        p_organization_id: input.organizationId,
        p_reason_code: input.reasonCode,
        p_review_policy_id: input.reviewPolicyId,
        p_rights_snapshot_id: input.rightsSnapshotId,
        p_scripture_evidence_id: input.scriptureEvidenceId,
        p_scripture_review_id: input.scriptureReviewId,
        p_theology_review_id: input.theologyReviewId,
      };
    }
    case "m1_create_audio_brief": {
      const input = arguments_ as BrowserCommandArguments["m1_create_audio_brief"];
      return {
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_payload: input.payload,
        p_title: input.title,
      };
    }
    case "m1_create_manual_version": {
      const input = arguments_ as BrowserCommandArguments["m1_create_manual_version"];
      return {
        p_brief_id: input.briefId,
        p_content_item_id: input.contentItemId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_payload: input.payload,
        p_supersedes_version_id: input.supersedesVersionId,
      };
    }
    case "m1_create_production_package": {
      const input = arguments_ as BrowserCommandArguments["m1_create_production_package"];
      return {
        p_approval_snapshot_id: input.approvalSnapshotId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
      };
    }
    case "m1_create_review_policy": {
      const input = arguments_ as BrowserCommandArguments["m1_create_review_policy"];
      return {
        p_correlation_id: input.correlationId,
        p_key: input.key,
        p_organization_id: input.organizationId,
        p_version: input.version,
      };
    }
    case "m1_record_review": {
      const input = arguments_ as BrowserCommandArguments["m1_record_review"];
      return {
        p_content_version_id: input.contentVersionId,
        p_correlation_id: input.correlationId,
        p_decision: input.decision,
        p_evidence: input.evidence,
        p_lane: input.lane,
        p_organization_id: input.organizationId,
        p_reason_code: input.reasonCode,
      };
    }
    case "m1_record_rights_snapshot": {
      const input = arguments_ as BrowserCommandArguments["m1_record_rights_snapshot"];
      return {
        p_content_version_id: input.contentVersionId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_source_summary: input.sourceSummary,
        p_status: input.status,
      };
    }
    case "m1_record_scripture_evidence": {
      const input = arguments_ as BrowserCommandArguments["m1_record_scripture_evidence"];
      return {
        p_content_version_id: input.contentVersionId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_reference: input.reference,
        p_source_citation: input.sourceCitation,
        p_translation: input.translation,
        p_verification_status: input.verificationStatus,
      };
    }
    case "m1_request_generation": {
      const input = arguments_ as BrowserCommandArguments["m1_request_generation"];
      return {
        p_brief_id: input.briefId,
        p_correlation_id: input.correlationId,
        p_idempotency_key: input.idempotencyKey,
        p_organization_id: input.organizationId,
        p_prompt_key: input.promptKey,
        p_prompt_version: input.promptVersion,
      };
    }
    case "m1_revoke_approval": {
      const input = arguments_ as BrowserCommandArguments["m1_revoke_approval"];
      return {
        p_approval_snapshot_id: input.approvalSnapshotId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_reason_code: input.reasonCode,
      };
    }
    case "m1_submit_version": {
      const input = arguments_ as BrowserCommandArguments["m1_submit_version"];
      return {
        p_content_version_id: input.contentVersionId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
      };
    }
    case "m2_request_media": {
      const input = arguments_ as BrowserCommandArguments["m2_request_media"];
      return {
        p_adapter_key: input.adapterKey,
        p_adapter_version: input.adapterVersion,
        p_correlation_id: input.correlationId,
        p_idempotency_key: input.idempotencyKey,
        p_organization_id: input.organizationId,
        p_output_spec_id: input.outputSpecId,
        p_production_package_id: input.productionPackageId,
      };
    }
    case "m2_record_media_review": {
      const input = arguments_ as BrowserCommandArguments["m2_record_media_review"];
      return {
        p_accessibility_status: input.accessibilityStatus,
        p_correlation_id: input.correlationId,
        p_decision: input.decision,
        p_evidence: input.evidence,
        p_media_artifact_id: input.mediaArtifactId,
        p_organization_id: input.organizationId,
        p_reason_code: input.reasonCode,
        p_transcript_status: input.transcriptStatus,
      };
    }
    case "m2_stage_release": {
      const input = arguments_ as BrowserCommandArguments["m2_stage_release"];
      return {
        p_configuration: input.configuration,
        p_correlation_id: input.correlationId,
        p_media_artifact_id: input.mediaArtifactId,
        p_media_review_id: input.mediaReviewId,
        p_organization_id: input.organizationId,
        p_production_package_id: input.productionPackageId,
      };
    }
    case "m2_revoke_staged_release": {
      const input = arguments_ as BrowserCommandArguments["m2_revoke_staged_release"];
      return {
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_reason_code: input.reasonCode,
        p_staged_release_bundle_id: input.stagedReleaseBundleId,
      };
    }
  }
}

function parseCommandResult<Name extends BrowserCommandName>(
  command: Name,
  value: unknown,
): BrowserCommandResult<Name> {
  if (command === "m1_create_audio_brief") {
    if (!Array.isArray(value) || value.length !== 1) {
      throw new Error("Invalid create audio brief response");
    }
    const row = requireRecord(value[0], "create audio brief");
    return Object.freeze({
      briefId: requireUuid(row, "brief_id"),
      contentItemId: requireUuid(row, "content_item_id"),
    }) as BrowserCommandResult<Name>;
  }
  if (command === "m1_submit_version") {
    if (value !== null && value !== undefined) {
      throw new Error("Invalid submit version response");
    }
    return undefined as BrowserCommandResult<Name>;
  }
  if (typeof value !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`Invalid ${command} response`);
  }
  return value as BrowserCommandResult<Name>;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    let code = "api_error";
    try {
      const error = requireRecord(JSON.parse(text), "error");
      if (typeof error.code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(error.code)) {
        code = error.code;
      }
    } catch {
      code = "api_error";
    }
    throw new StudioApiError(response.status, code);
  }
  if (text.length === 0) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

function parseMediaArtifact(value: unknown, organizationId: Uuid): TenantMediaArtifactSummary {
  const row = requireTenantRow(value, "media artifact", organizationId);
  if (
    requireString(row, "bucket_id") !== "strongr-os-media" ||
    requireString(row, "mime_type") !== "audio/wav" ||
    requireString(row, "container") !== "wav" ||
    requireString(row, "codec") !== "pcm_s16le" ||
    requireInteger(row, "channels") !== 1 ||
    requireInteger(row, "sample_rate_hz") !== 16_000 ||
    requireInteger(row, "bits_per_sample") !== 16 ||
    requireString(row, "validation_schema_id") !== "strongr.media_validation.v1"
  ) {
    throw new Error("Invalid tenant media artifact response");
  }
  const id = requireUuid(row, "id");
  const productionPackageId = requireUuid(row, "production_package_id");
  const objectPath = requireString(row, "object_path");
  const expectedPath = `${organizationId}/${productionPackageId}/${id}.wav`;
  if (objectPath !== expectedPath) {
    throw new Error("Invalid tenant media artifact path");
  }
  return Object.freeze({
    bitsPerSample: 16 as const,
    bucketId: "strongr-os-media" as const,
    byteCount: requireInteger(row, "byte_count"),
    channels: 1 as const,
    codec: "pcm_s16le" as const,
    container: "wav" as const,
    createdAt: requireString(row, "created_at"),
    durationMs: requireInteger(row, "duration_ms"),
    id,
    mediaJobId: requireUuid(row, "media_job_id"),
    mimeType: "audio/wav" as const,
    objectPath,
    organizationId,
    outputSpecId: requireUuid(row, "output_spec_id"),
    productionPackageId,
    sampleRateHz: 16_000 as const,
    sha256: requireHash(row, "sha256"),
    successfulAttemptId: requireUuid(row, "successful_attempt_id"),
    validatedAt: requireString(row, "validated_at"),
    validationSchemaId: "strongr.media_validation.v1" as const,
  });
}

function mediaArtifactSelect(): string {
  return [
    "id",
    "organization_id",
    "media_job_id",
    "production_package_id",
    "output_spec_id",
    "successful_attempt_id",
    "bucket_id",
    "object_path",
    "mime_type",
    "container",
    "codec",
    "channels",
    "sample_rate_hz",
    "bits_per_sample",
    "duration_ms",
    "byte_count",
    "sha256",
    "validation_schema_id",
    "validated_at",
    "created_at",
  ].join(",");
}

function encodeMediaObjectPath(objectPath: string): string {
  return objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export class StudioSupabaseGateway implements StudioCommandGateway {
  readonly #accessToken: string;
  readonly #environment: StudioEnvironment;
  readonly #fetch: StudioFetch;

  constructor(input: {
    readonly accessToken: string;
    readonly environment: StudioEnvironment;
    readonly fetch?: StudioFetch;
  }) {
    this.#accessToken = requireAccessToken(input.accessToken);
    this.#environment = input.environment;
    this.#fetch = input.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async invoke<Name extends BrowserCommandName>(
    command: Name,
    arguments_: BrowserCommandArguments[Name],
  ): Promise<BrowserCommandResult<Name>> {
    const response = await this.#fetch(`${this.#environment.supabaseUrl}/rest/v1/rpc/${command}`, {
      body: JSON.stringify(commandBody(command, arguments_)),
      headers: this.#headers(true),
      method: "POST",
    });
    return parseCommandResult(command, await readJson(response));
  }

  async listBriefs(organizationId: Uuid, limit = 50): Promise<readonly TenantBriefSummary[]> {
    const rows = await this.#readRows(
      "content_briefs",
      "id,organization_id,content_item_id,schema_id,payload_hash,created_at",
      organizationId,
      limit,
    );
    const allowedSchemaIds = [
      "strongr.audio_reflection_brief.v1",
      "strongr.strongr_daily_audio_reflection_brief.v2",
    ] as const;
    return Object.freeze(
      rows.map((value) => {
        const row = requireRecord(value, "brief");
        const schemaId = requireString(row, "schema_id");
        if (
          requireUuid(row, "organization_id") !== organizationId ||
          !allowedSchemaIds.includes(schemaId as (typeof allowedSchemaIds)[number])
        ) {
          throw new Error("Invalid tenant brief response");
        }
        return Object.freeze({
          contentItemId: requireUuid(row, "content_item_id"),
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          organizationId,
          payloadHash: requireHash(row, "payload_hash"),
          schemaId: schemaId as TenantBriefSummary["schemaId"],
        });
      }),
    );
  }

  async listCheckDefinitions(limit = 50): Promise<readonly CheckDefinitionSummary[]> {
    const rows = await this.#readRows(
      "check_definitions",
      "id,key,version,name,lane,blocks_approval",
      null,
      limit,
      "key.asc,version.asc",
    );
    const lanes: readonly CheckDefinitionLane[] = [
      "scripture",
      "pastoral",
      "editorial",
      "rights",
      "accessibility",
      "narration",
    ];
    return Object.freeze(
      rows.map((value) => {
        const row = requireRecord(value, "check definition");
        return Object.freeze({
          blocksApproval: requireBoolean(row, "blocks_approval"),
          id: requireUuid(row, "id"),
          key: requireString(row, "key"),
          lane: requireOneOf(row, "lane", lanes),
          name: requireString(row, "name"),
          version: requireInteger(row, "version"),
        });
      }),
    );
  }

  async listCheckRuns(organizationId: Uuid, limit = 50): Promise<readonly TenantCheckRunSummary[]> {
    const rows = await this.#readRows(
      "check_runs",
      [
        "id",
        "organization_id",
        "content_version_id",
        "engine_key",
        "engine_version",
        "status",
        "artifact_hash",
        "correlation_id",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    const statuses: readonly CheckRunStatus[] = ["completed", "failed"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "check run", organizationId);
        return Object.freeze({
          artifactHash: requireHash(row, "artifact_hash"),
          contentVersionId: requireUuid(row, "content_version_id"),
          correlationId: requireUuid(row, "correlation_id"),
          createdAt: requireString(row, "created_at"),
          engineKey: requireString(row, "engine_key"),
          engineVersion: requireString(row, "engine_version"),
          id: requireUuid(row, "id"),
          organizationId,
          status: requireOneOf(row, "status", statuses),
        });
      }),
    );
  }

  async listCheckResults(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantCheckResultSummary[]> {
    const rows = await this.#readRows(
      "check_results",
      [
        "id",
        "organization_id",
        "check_run_id",
        "check_definition_id",
        "outcome",
        "detail_code",
        "evidence",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    const outcomes: readonly CheckOutcome[] = ["pass", "warn", "fail", "error"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "check result", organizationId);
        return Object.freeze({
          checkDefinitionId: requireUuid(row, "check_definition_id"),
          checkRunId: requireUuid(row, "check_run_id"),
          createdAt: requireString(row, "created_at"),
          detailCode: requireString(row, "detail_code"),
          evidence: requireJsonObject(row.evidence, "evidence"),
          id: requireUuid(row, "id"),
          organizationId,
          outcome: requireOneOf(row, "outcome", outcomes),
        });
      }),
    );
  }

  async listGenerationJobs(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantGenerationJobSummary[]> {
    const rows = await this.#readRows(
      "generation_jobs",
      "id,organization_id,brief_id,state,attempt_count,output_hash,created_at,finished_at",
      organizationId,
      limit,
    );
    const allowedStates: readonly GenerationJobState[] = [
      "queued",
      "running",
      "succeeded",
      "failed",
      "dead_letter",
      "cancelled",
    ];
    return Object.freeze(
      rows.map((value) => {
        const row = requireRecord(value, "generation job");
        const state = requireString(row, "state");
        if (
          requireUuid(row, "organization_id") !== organizationId ||
          !allowedStates.includes(state as GenerationJobState)
        ) {
          throw new Error("Invalid tenant generation job response");
        }
        return Object.freeze({
          attemptCount: requireInteger(row, "attempt_count"),
          briefId: requireUuid(row, "brief_id"),
          createdAt: requireString(row, "created_at"),
          finishedAt: requireNullableString(row, "finished_at"),
          id: requireUuid(row, "id"),
          organizationId,
          outputHash: requireNullableHash(row, "output_hash"),
          state: state as GenerationJobState,
        });
      }),
    );
  }

  async listContentVersions(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantContentVersionSummary[]> {
    const rows = await this.#readRows(
      "content_versions",
      [
        "id",
        "organization_id",
        "content_item_id",
        "brief_id",
        "version_number",
        "schema_id",
        "payload",
        "payload_hash",
        "source",
        "source_job_id",
        "state",
        "created_at",
        "submitted_at",
      ].join(","),
      organizationId,
      limit,
    );
    const allowedSources: readonly ContentVersionSource[] = ["manual", "ai_assisted"];
    const allowedStates: readonly ContentVersionState[] = ["draft", "submitted", "superseded"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireRecord(value, "content version");
        const source = requireString(row, "source");
        const state = requireString(row, "state");
        const schemaId = requireString(row, "schema_id");
        if (
          requireUuid(row, "organization_id") !== organizationId ||
          !["strongr.audio_reflection.v1", "strongr.strongr_daily_audio_reflection.v2"].includes(
            schemaId,
          ) ||
          !allowedSources.includes(source as ContentVersionSource) ||
          !allowedStates.includes(state as ContentVersionState)
        ) {
          throw new Error("Invalid tenant content version response");
        }
        return Object.freeze({
          briefId: requireUuid(row, "brief_id"),
          contentItemId: requireUuid(row, "content_item_id"),
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          organizationId,
          payload: requireJsonValue(row.payload, "payload"),
          payloadHash: requireHash(row, "payload_hash"),
          schemaId: schemaId as TenantContentVersionSummary["schemaId"],
          source: source as ContentVersionSource,
          sourceJobId: requireNullableUuid(row, "source_job_id"),
          state: state as ContentVersionState,
          submittedAt: requireNullableString(row, "submitted_at"),
          versionNumber: requireInteger(row, "version_number"),
        });
      }),
    );
  }

  async listScriptureEvidence(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantScriptureEvidenceSummary[]> {
    const rows = await this.#readRows(
      "scripture_evidence",
      [
        "id",
        "organization_id",
        "content_version_id",
        "reference",
        "translation",
        "source_citation",
        "verification_status",
        "evidence_hash",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    const statuses: readonly ScriptureVerificationStatus[] = ["verified", "blocked"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "Scripture evidence", organizationId);
        return Object.freeze({
          contentVersionId: requireUuid(row, "content_version_id"),
          createdAt: requireString(row, "created_at"),
          evidenceHash: requireHash(row, "evidence_hash"),
          id: requireUuid(row, "id"),
          organizationId,
          reference: requireString(row, "reference"),
          sourceCitation: requireString(row, "source_citation"),
          translation: requireString(row, "translation"),
          verificationStatus: requireOneOf(row, "verification_status", statuses),
        });
      }),
    );
  }

  async listRightsSnapshots(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantRightsSnapshotSummary[]> {
    const rows = await this.#readRows(
      "rights_snapshots",
      "id,organization_id,content_version_id,status,source_summary,snapshot_hash,created_at",
      organizationId,
      limit,
    );
    const statuses: readonly RightsStatus[] = ["cleared", "blocked"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "rights snapshot", organizationId);
        return Object.freeze({
          contentVersionId: requireUuid(row, "content_version_id"),
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          organizationId,
          snapshotHash: requireHash(row, "snapshot_hash"),
          sourceSummary: requireString(row, "source_summary"),
          status: requireOneOf(row, "status", statuses),
        });
      }),
    );
  }

  async listReviewPolicies(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantReviewPolicySummary[]> {
    const rows = await this.#readRows(
      "review_policies",
      "id,organization_id,key,version,policy_hash,is_active,created_at",
      organizationId,
      limit,
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "review policy", organizationId);
        return Object.freeze({
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          isActive: requireBoolean(row, "is_active"),
          key: requireString(row, "key"),
          organizationId,
          policyHash: requireHash(row, "policy_hash"),
          version: requireInteger(row, "version"),
        });
      }),
    );
  }

  async listReviewDecisions(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantReviewDecisionSummary[]> {
    const rows = await this.#readRows(
      "review_decisions",
      "id,organization_id,content_version_id,lane,decision,reason_code,evidence,created_at",
      organizationId,
      limit,
    );
    const lanes: readonly ReviewLane[] = ["scripture", "theology", "editorial"];
    const decisions: readonly ReviewDecision[] = ["approved", "changes_requested", "rejected"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "review decision", organizationId);
        return Object.freeze({
          contentVersionId: requireUuid(row, "content_version_id"),
          createdAt: requireString(row, "created_at"),
          decision: requireOneOf(row, "decision", decisions),
          evidence: requireJsonObject(row.evidence, "evidence"),
          id: requireUuid(row, "id"),
          lane: requireOneOf(row, "lane", lanes),
          organizationId,
          reasonCode: requireString(row, "reason_code"),
        });
      }),
    );
  }

  async listApprovalSnapshots(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantApprovalSnapshotSummary[]> {
    const rows = await this.#readRows(
      "approval_snapshots",
      [
        "id",
        "organization_id",
        "content_version_id",
        "review_policy_id",
        "check_run_id",
        "scripture_evidence_id",
        "rights_snapshot_id",
        "version_payload_hash",
        "evidence_bundle_hash",
        "authentication_assurance",
        "reason_code",
        "approved_at",
      ].join(","),
      organizationId,
      limit,
      "approved_at.desc,id.desc",
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "approval snapshot", organizationId);
        if (requireString(row, "authentication_assurance") !== "aal2") {
          throw new Error("Invalid tenant approval snapshot response");
        }
        return Object.freeze({
          approvedAt: requireString(row, "approved_at"),
          authenticationAssurance: "aal2" as const,
          checkRunId: requireUuid(row, "check_run_id"),
          contentVersionId: requireUuid(row, "content_version_id"),
          evidenceBundleHash: requireHash(row, "evidence_bundle_hash"),
          id: requireUuid(row, "id"),
          organizationId,
          reasonCode: requireString(row, "reason_code"),
          reviewPolicyId: requireUuid(row, "review_policy_id"),
          rightsSnapshotId: requireUuid(row, "rights_snapshot_id"),
          scriptureEvidenceId: requireUuid(row, "scripture_evidence_id"),
          versionPayloadHash: requireHash(row, "version_payload_hash"),
        });
      }),
    );
  }

  async listApprovalRevocations(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantApprovalRevocationSummary[]> {
    const rows = await this.#readRows(
      "approval_revocations",
      "id,organization_id,approval_snapshot_id,reason_code,revoked_at",
      organizationId,
      limit,
      "revoked_at.desc,id.desc",
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "approval revocation", organizationId);
        return Object.freeze({
          approvalSnapshotId: requireUuid(row, "approval_snapshot_id"),
          id: requireUuid(row, "id"),
          organizationId,
          reasonCode: requireString(row, "reason_code"),
          revokedAt: requireString(row, "revoked_at"),
        });
      }),
    );
  }

  async listProductionPackages(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantProductionPackageSummary[]> {
    const rows = await this.#readRows(
      "production_packages",
      [
        "id",
        "organization_id",
        "approval_snapshot_id",
        "manifest_schema_id",
        "manifest",
        "manifest_hash",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "production package", organizationId);
        if (requireString(row, "manifest_schema_id") !== "strongr.production_package.v1") {
          throw new Error("Invalid tenant production package response");
        }
        return Object.freeze({
          approvalSnapshotId: requireUuid(row, "approval_snapshot_id"),
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          manifest: requireJsonObject(row.manifest, "manifest"),
          manifestHash: requireHash(row, "manifest_hash"),
          manifestSchemaId: "strongr.production_package.v1" as const,
          organizationId,
        });
      }),
    );
  }

  async getMediaArtifact(
    organizationId: Uuid,
    mediaArtifactId: Uuid,
  ): Promise<TenantMediaArtifactSummary> {
    const parameters = new URLSearchParams({
      id: `eq.${mediaArtifactId}`,
      limit: "1",
      organization_id: `eq.${organizationId}`,
      select: mediaArtifactSelect(),
    });
    const response = await this.#fetch(
      `${this.#environment.supabaseUrl}/rest/v1/media_artifacts?${parameters.toString()}`,
      {
        headers: this.#headers(false),
        method: "GET",
      },
    );
    const value = await readJson(response);
    if (!Array.isArray(value) || value.length !== 1) {
      throw new StudioApiError(404, "media_artifact_not_found");
    }
    return parseMediaArtifact(value[0], organizationId);
  }

  async downloadMediaArtifact(
    organizationId: Uuid,
    mediaArtifactId: Uuid,
  ): Promise<VerifiedMediaArtifactDownload> {
    const artifact = await this.getMediaArtifact(organizationId, mediaArtifactId);
    const response = await this.#fetch(
      `${this.#environment.supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(
        artifact.bucketId,
      )}/${encodeMediaObjectPath(artifact.objectPath)}`,
      {
        cache: "no-store",
        headers: {
          accept: artifact.mimeType,
          apikey: this.#environment.supabasePublishableKey,
          authorization: `Bearer ${this.#accessToken}`,
        },
        method: "GET",
      },
    );
    if (!response.ok) {
      if (response.status === 404) {
        throw new StudioApiError(404, "media_object_not_found");
      }
      throw new StudioApiError(response.status, "storage_download_failed");
    }
    if (response.headers.get("content-type")?.split(";")[0]?.trim() !== artifact.mimeType) {
      throw new StudioApiError(422, "media_content_type_mismatch");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== artifact.byteCount) {
      throw new StudioApiError(422, "media_byte_count_mismatch");
    }
    const observedSha256 = await sha256Hex(bytes);
    if (observedSha256 !== artifact.sha256) {
      throw new StudioApiError(422, "media_checksum_mismatch");
    }
    return Object.freeze({
      artifact,
      bytes,
      sha256: observedSha256,
    });
  }

  async listMediaOutputSpecs(limit = 50): Promise<readonly MediaOutputSpecSummary[]> {
    const rows = await this.#readRows(
      "media_output_specs",
      [
        "id",
        "key",
        "version",
        "media_kind",
        "container",
        "codec",
        "mime_type",
        "channels",
        "sample_rate_hz",
        "bits_per_sample",
        "max_duration_ms",
        "max_bytes",
        "spec_hash",
        "created_at",
      ].join(","),
      null,
      limit,
      "key.asc,version.asc",
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireRecord(value, "media output specification");
        if (
          requireString(row, "key") !== "strongr.synthetic_audio" ||
          requireInteger(row, "version") !== 1 ||
          requireString(row, "media_kind") !== "audio" ||
          requireString(row, "container") !== "wav" ||
          requireString(row, "codec") !== "pcm_s16le" ||
          requireString(row, "mime_type") !== "audio/wav" ||
          requireInteger(row, "channels") !== 1 ||
          requireInteger(row, "sample_rate_hz") !== 16_000 ||
          requireInteger(row, "bits_per_sample") !== 16 ||
          requireInteger(row, "max_duration_ms") !== 900_000 ||
          requireInteger(row, "max_bytes") !== 26_214_400
        ) {
          throw new Error("Invalid media output specification response");
        }
        return Object.freeze({
          bitsPerSample: 16 as const,
          channels: 1 as const,
          codec: "pcm_s16le" as const,
          container: "wav" as const,
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          key: "strongr.synthetic_audio" as const,
          maxBytes: 26_214_400 as const,
          maxDurationMs: 900_000 as const,
          mediaKind: "audio" as const,
          mimeType: "audio/wav" as const,
          sampleRateHz: 16_000 as const,
          specHash: requireHash(row, "spec_hash"),
          version: 1 as const,
        });
      }),
    );
  }

  async listMediaJobs(organizationId: Uuid, limit = 50): Promise<readonly TenantMediaJobSummary[]> {
    const rows = await this.#readRows(
      "media_jobs",
      [
        "id",
        "organization_id",
        "production_package_id",
        "output_spec_id",
        "requested_by_membership_id",
        "adapter_key",
        "adapter_version",
        "request_schema_id",
        "input_hash",
        "correlation_id",
        "state",
        "attempt_count",
        "max_attempts",
        "available_at",
        "started_at",
        "finished_at",
        "last_error_code",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    const states: readonly MediaJobState[] = [
      "queued",
      "running",
      "succeeded",
      "failed",
      "dead_letter",
      "cancelled",
    ];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "media job", organizationId);
        if (requireString(row, "request_schema_id") !== "strongr.media_request.v1") {
          throw new Error("Invalid tenant media job response");
        }
        return Object.freeze({
          adapterKey: requireString(row, "adapter_key"),
          adapterVersion: requireString(row, "adapter_version"),
          attemptCount: requireInteger(row, "attempt_count"),
          availableAt: requireString(row, "available_at"),
          correlationId: requireUuid(row, "correlation_id"),
          createdAt: requireString(row, "created_at"),
          finishedAt: requireNullableString(row, "finished_at"),
          id: requireUuid(row, "id"),
          inputHash: requireHash(row, "input_hash"),
          lastErrorCode: requireNullableString(row, "last_error_code"),
          maxAttempts: requireInteger(row, "max_attempts"),
          organizationId,
          outputSpecId: requireUuid(row, "output_spec_id"),
          productionPackageId: requireUuid(row, "production_package_id"),
          requestSchemaId: "strongr.media_request.v1" as const,
          requestedByMembershipId: requireUuid(row, "requested_by_membership_id"),
          startedAt: requireNullableString(row, "started_at"),
          state: requireOneOf(row, "state", states),
        });
      }),
    );
  }

  async listMediaArtifacts(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantMediaArtifactSummary[]> {
    const rows = await this.#readRows(
      "media_artifacts",
      mediaArtifactSelect(),
      organizationId,
      limit,
    );
    return Object.freeze(rows.map((value) => parseMediaArtifact(value, organizationId)));
  }

  async listMediaReviews(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantMediaReviewSummary[]> {
    const rows = await this.#readRows(
      "media_reviews",
      [
        "id",
        "organization_id",
        "media_artifact_id",
        "reviewer_membership_id",
        "decision",
        "transcript_status",
        "accessibility_status",
        "reason_code",
        "evidence",
        "evidence_hash",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    const decisions: readonly MediaReviewDecision[] = ["approved", "changes_requested", "rejected"];
    const transcripts: readonly MediaTranscriptStatus[] = ["ready", "blocked"];
    const accessibility: readonly MediaAccessibilityStatus[] = ["approved", "blocked"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "media review", organizationId);
        return Object.freeze({
          accessibilityStatus: requireOneOf(row, "accessibility_status", accessibility),
          createdAt: requireString(row, "created_at"),
          decision: requireOneOf(row, "decision", decisions),
          evidence: requireJsonObject(row.evidence, "evidence"),
          evidenceHash: requireHash(row, "evidence_hash"),
          id: requireUuid(row, "id"),
          mediaArtifactId: requireUuid(row, "media_artifact_id"),
          organizationId,
          reasonCode: requireString(row, "reason_code"),
          reviewerMembershipId: requireUuid(row, "reviewer_membership_id"),
          transcriptStatus: requireOneOf(row, "transcript_status", transcripts),
        });
      }),
    );
  }

  async listStagedReleaseBundles(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantStagedReleaseBundleSummary[]> {
    const rows = await this.#readRows(
      "staged_release_bundles",
      [
        "id",
        "organization_id",
        "production_package_id",
        "media_artifact_id",
        "media_review_id",
        "manifest_schema_id",
        "manifest",
        "manifest_hash",
        "staged_by_membership_id",
        "authentication_assurance",
        "staged_at",
      ].join(","),
      organizationId,
      limit,
      "staged_at.desc,id.desc",
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "staged release bundle", organizationId);
        if (
          requireString(row, "manifest_schema_id") !== "strongr.staged_release_bundle.v1" ||
          requireString(row, "authentication_assurance") !== "aal2"
        ) {
          throw new Error("Invalid tenant staged release bundle response");
        }
        return Object.freeze({
          authenticationAssurance: "aal2" as const,
          id: requireUuid(row, "id"),
          manifest: requireJsonObject(row.manifest, "manifest"),
          manifestHash: requireHash(row, "manifest_hash"),
          manifestSchemaId: "strongr.staged_release_bundle.v1" as const,
          mediaArtifactId: requireUuid(row, "media_artifact_id"),
          mediaReviewId: requireUuid(row, "media_review_id"),
          organizationId,
          productionPackageId: requireUuid(row, "production_package_id"),
          stagedAt: requireString(row, "staged_at"),
          stagedByMembershipId: requireUuid(row, "staged_by_membership_id"),
        });
      }),
    );
  }

  async listStagedReleaseRevocations(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantStagedReleaseRevocationSummary[]> {
    const rows = await this.#readRows(
      "staged_release_revocations",
      [
        "id",
        "organization_id",
        "staged_release_bundle_id",
        "revoked_by_membership_id",
        "reason_code",
        "authentication_assurance",
        "revoked_at",
      ].join(","),
      organizationId,
      limit,
      "revoked_at.desc,id.desc",
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "staged release revocation", organizationId);
        if (requireString(row, "authentication_assurance") !== "aal2") {
          throw new Error("Invalid tenant staged release revocation response");
        }
        return Object.freeze({
          authenticationAssurance: "aal2" as const,
          id: requireUuid(row, "id"),
          organizationId,
          reasonCode: requireString(row, "reason_code"),
          revokedAt: requireString(row, "revoked_at"),
          revokedByMembershipId: requireUuid(row, "revoked_by_membership_id"),
          stagedReleaseBundleId: requireUuid(row, "staged_release_bundle_id"),
        });
      }),
    );
  }

  async #readRows(
    table: string,
    select: string,
    organizationId: Uuid | null,
    limit: number,
    order = "created_at.desc,id.desc",
  ): Promise<readonly unknown[]> {
    const parameters = new URLSearchParams({
      limit: String(requireLimit(limit)),
      order,
      select,
      ...(organizationId === null ? {} : { organization_id: `eq.${organizationId}` }),
    });
    const response = await this.#fetch(
      `${this.#environment.supabaseUrl}/rest/v1/${table}?${parameters.toString()}`,
      {
        headers: this.#headers(false),
        method: "GET",
      },
    );
    const value = await readJson(response);
    if (!Array.isArray(value)) {
      throw new Error(`Invalid ${table} response`);
    }
    return value;
  }

  #headers(includeContentType: boolean): Readonly<Record<string, string>> {
    return Object.freeze({
      accept: "application/json",
      apikey: this.#environment.supabasePublishableKey,
      authorization: `Bearer ${this.#accessToken}`,
      ...(includeContentType ? { "content-type": "application/json" } : {}),
    });
  }
}

export function createStudioSupabaseGateway(input: {
  readonly accessToken: string;
  readonly environment: StudioEnvironment;
  readonly fetch?: StudioFetch;
}): StudioSupabaseGateway {
  return new StudioSupabaseGateway(input);
}
import type {
  BrowserCommandArguments,
  BrowserCommandName,
  BrowserCommandResult,
  CheckDefinitionLane,
  CheckDefinitionSummary,
  CheckOutcome,
  CheckRunStatus,
  ContentVersionSource,
  ContentVersionState,
  GenerationJobState,
  JsonObject,
  JsonValue,
  MediaAccessibilityStatus,
  MediaJobState,
  MediaOutputSpecSummary,
  MediaReviewDecision,
  MediaTranscriptStatus,
  ReviewDecision,
  ReviewLane,
  RightsStatus,
  ScriptureVerificationStatus,
  TenantApprovalRevocationSummary,
  TenantApprovalSnapshotSummary,
  TenantBriefSummary,
  TenantCheckResultSummary,
  TenantCheckRunSummary,
  TenantContentVersionSummary,
  TenantGenerationJobSummary,
  TenantMediaArtifactSummary,
  TenantMediaJobSummary,
  TenantMediaReviewSummary,
  TenantProductionPackageSummary,
  TenantReviewDecisionSummary,
  TenantReviewPolicySummary,
  TenantRightsSnapshotSummary,
  TenantScriptureEvidenceSummary,
  TenantStagedReleaseBundleSummary,
  TenantStagedReleaseRevocationSummary,
  Uuid,
  VerifiedMediaArtifactDownload,
} from "../../../packages/contracts/src/index.ts";

import type { StudioEnvironment } from "./environment.ts";
import type { StudioCommandGateway } from "./foundation.ts";

export type StudioFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type UnknownRecord = Readonly<Record<string, unknown>>;

export class StudioApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string) {
    super(`Studio API request failed (${status}:${code})`);
    this.name = "StudioApiError";
    this.status = status;
    this.code = code;
  }
}

function requireRecord(value: unknown, name: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${name} response`);
  }
  return value as UnknownRecord;
}

function requireTenantRow(value: unknown, name: string, organizationId: Uuid): UnknownRecord {
  const row = requireRecord(value, name);
  if (requireUuid(row, "organization_id") !== organizationId) {
    throw new Error(`Invalid tenant ${name} response`);
  }
  return row;
}

function requireString(record: UnknownRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireNullableString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  return requireString(record, key);
}

function requireInteger(record: UnknownRecord, key: string): number {
  const value = record[key];
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value as number;
}

function requireBoolean(record: UnknownRecord, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireUuid(record: UnknownRecord, key: string): Uuid {
  const value = requireString(record, key);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireNullableUuid(record: UnknownRecord, key: string): Uuid | null {
  const value = requireNullableString(record, key);
  if (value === null) {
    return null;
  }
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireHash(record: UnknownRecord, key: string): string {
  const value = requireString(record, key);
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireNullableHash(record: UnknownRecord, key: string): string | null {
  const value = requireNullableString(record, key);
  if (value === null) {
    return null;
  }
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value;
}

function requireJsonValue(value: unknown, key: string): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => requireJsonValue(item, key));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, item]) => [entryKey, requireJsonValue(item, key)]),
    );
  }
  throw new Error(`Invalid Studio API field: ${key}`);
}

function requireJsonObject(value: unknown, key: string): JsonObject {
  const result = requireJsonValue(value, key);
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return result;
}

function requireOneOf<const Value extends string>(
  record: UnknownRecord,
  key: string,
  allowed: readonly Value[],
): Value {
  const value = requireString(record, key);
  if (!allowed.includes(value as Value)) {
    throw new Error(`Invalid Studio API field: ${key}`);
  }
  return value as Value;
}

function requireLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("Studio read limit must be between 1 and 100");
  }
  return value;
}

function requireAccessToken(value: string): string {
  const token = value.trim();
  if (!token || token.startsWith("sb_")) {
    throw new Error("Studio requires an authenticated user access token");
  }
  return token;
}

function commandBody<Name extends BrowserCommandName>(
  command: Name,
  arguments_: BrowserCommandArguments[Name],
): UnknownRecord {
  switch (command) {
    case "m1_approve_version": {
      const input = arguments_ as BrowserCommandArguments["m1_approve_version"];
      return {
        p_check_run_id: input.checkRunId,
        p_content_version_id: input.contentVersionId,
        p_correlation_id: input.correlationId,
        p_editorial_review_id: input.editorialReviewId,
        p_organization_id: input.organizationId,
        p_reason_code: input.reasonCode,
        p_review_policy_id: input.reviewPolicyId,
        p_rights_snapshot_id: input.rightsSnapshotId,
        p_scripture_evidence_id: input.scriptureEvidenceId,
        p_scripture_review_id: input.scriptureReviewId,
        p_theology_review_id: input.theologyReviewId,
      };
    }
    case "m1_create_audio_brief": {
      const input = arguments_ as BrowserCommandArguments["m1_create_audio_brief"];
      return {
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_payload: input.payload,
        p_title: input.title,
      };
    }
    case "m1_create_manual_version": {
      const input = arguments_ as BrowserCommandArguments["m1_create_manual_version"];
      return {
        p_brief_id: input.briefId,
        p_content_item_id: input.contentItemId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_payload: input.payload,
        p_supersedes_version_id: input.supersedesVersionId,
      };
    }
    case "m1_create_production_package": {
      const input = arguments_ as BrowserCommandArguments["m1_create_production_package"];
      return {
        p_approval_snapshot_id: input.approvalSnapshotId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
      };
    }
    case "m1_create_review_policy": {
      const input = arguments_ as BrowserCommandArguments["m1_create_review_policy"];
      return {
        p_correlation_id: input.correlationId,
        p_key: input.key,
        p_organization_id: input.organizationId,
        p_version: input.version,
      };
    }
    case "m1_record_review": {
      const input = arguments_ as BrowserCommandArguments["m1_record_review"];
      return {
        p_content_version_id: input.contentVersionId,
        p_correlation_id: input.correlationId,
        p_decision: input.decision,
        p_evidence: input.evidence,
        p_lane: input.lane,
        p_organization_id: input.organizationId,
        p_reason_code: input.reasonCode,
      };
    }
    case "m1_record_rights_snapshot": {
      const input = arguments_ as BrowserCommandArguments["m1_record_rights_snapshot"];
      return {
        p_content_version_id: input.contentVersionId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_source_summary: input.sourceSummary,
        p_status: input.status,
      };
    }
    case "m1_record_scripture_evidence": {
      const input = arguments_ as BrowserCommandArguments["m1_record_scripture_evidence"];
      return {
        p_content_version_id: input.contentVersionId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_reference: input.reference,
        p_source_citation: input.sourceCitation,
        p_translation: input.translation,
        p_verification_status: input.verificationStatus,
      };
    }
    case "m1_request_generation": {
      const input = arguments_ as BrowserCommandArguments["m1_request_generation"];
      return {
        p_brief_id: input.briefId,
        p_correlation_id: input.correlationId,
        p_idempotency_key: input.idempotencyKey,
        p_organization_id: input.organizationId,
        p_prompt_key: input.promptKey,
        p_prompt_version: input.promptVersion,
      };
    }
    case "m1_revoke_approval": {
      const input = arguments_ as BrowserCommandArguments["m1_revoke_approval"];
      return {
        p_approval_snapshot_id: input.approvalSnapshotId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_reason_code: input.reasonCode,
      };
    }
    case "m1_submit_version": {
      const input = arguments_ as BrowserCommandArguments["m1_submit_version"];
      return {
        p_content_version_id: input.contentVersionId,
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
      };
    }
    case "m2_request_media": {
      const input = arguments_ as BrowserCommandArguments["m2_request_media"];
      return {
        p_adapter_key: input.adapterKey,
        p_adapter_version: input.adapterVersion,
        p_correlation_id: input.correlationId,
        p_idempotency_key: input.idempotencyKey,
        p_organization_id: input.organizationId,
        p_output_spec_id: input.outputSpecId,
        p_production_package_id: input.productionPackageId,
      };
    }
    case "m2_record_media_review": {
      const input = arguments_ as BrowserCommandArguments["m2_record_media_review"];
      return {
        p_accessibility_status: input.accessibilityStatus,
        p_correlation_id: input.correlationId,
        p_decision: input.decision,
        p_evidence: input.evidence,
        p_media_artifact_id: input.mediaArtifactId,
        p_organization_id: input.organizationId,
        p_reason_code: input.reasonCode,
        p_transcript_status: input.transcriptStatus,
      };
    }
    case "m2_stage_release": {
      const input = arguments_ as BrowserCommandArguments["m2_stage_release"];
      return {
        p_configuration: input.configuration,
        p_correlation_id: input.correlationId,
        p_media_artifact_id: input.mediaArtifactId,
        p_media_review_id: input.mediaReviewId,
        p_organization_id: input.organizationId,
        p_production_package_id: input.productionPackageId,
      };
    }
    case "m2_revoke_staged_release": {
      const input = arguments_ as BrowserCommandArguments["m2_revoke_staged_release"];
      return {
        p_correlation_id: input.correlationId,
        p_organization_id: input.organizationId,
        p_reason_code: input.reasonCode,
        p_staged_release_bundle_id: input.stagedReleaseBundleId,
      };
    }
  }
}

function parseCommandResult<Name extends BrowserCommandName>(
  command: Name,
  value: unknown,
): BrowserCommandResult<Name> {
  if (command === "m1_create_audio_brief") {
    if (!Array.isArray(value) || value.length !== 1) {
      throw new Error("Invalid create audio brief response");
    }
    const row = requireRecord(value[0], "create audio brief");
    return Object.freeze({
      briefId: requireUuid(row, "brief_id"),
      contentItemId: requireUuid(row, "content_item_id"),
    }) as BrowserCommandResult<Name>;
  }
  if (command === "m1_submit_version") {
    if (value !== null && value !== undefined) {
      throw new Error("Invalid submit version response");
    }
    return undefined as BrowserCommandResult<Name>;
  }
  if (typeof value !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`Invalid ${command} response`);
  }
  return value as BrowserCommandResult<Name>;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    let code = "api_error";
    try {
      const error = requireRecord(JSON.parse(text), "error");
      if (typeof error.code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(error.code)) {
        code = error.code;
      }
    } catch {
      code = "api_error";
    }
    throw new StudioApiError(response.status, code);
  }
  if (text.length === 0) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

function parseMediaArtifact(value: unknown, organizationId: Uuid): TenantMediaArtifactSummary {
  const row = requireTenantRow(value, "media artifact", organizationId);
  if (
    requireString(row, "bucket_id") !== "strongr-os-media" ||
    requireString(row, "mime_type") !== "audio/wav" ||
    requireString(row, "container") !== "wav" ||
    requireString(row, "codec") !== "pcm_s16le" ||
    requireInteger(row, "channels") !== 1 ||
    requireInteger(row, "sample_rate_hz") !== 16_000 ||
    requireInteger(row, "bits_per_sample") !== 16 ||
    requireString(row, "validation_schema_id") !== "strongr.media_validation.v1"
  ) {
    throw new Error("Invalid tenant media artifact response");
  }
  const id = requireUuid(row, "id");
  const productionPackageId = requireUuid(row, "production_package_id");
  const objectPath = requireString(row, "object_path");
  const expectedPath = `${organizationId}/${productionPackageId}/${id}.wav`;
  if (objectPath !== expectedPath) {
    throw new Error("Invalid tenant media artifact path");
  }
  return Object.freeze({
    bitsPerSample: 16 as const,
    bucketId: "strongr-os-media" as const,
    byteCount: requireInteger(row, "byte_count"),
    channels: 1 as const,
    codec: "pcm_s16le" as const,
    container: "wav" as const,
    createdAt: requireString(row, "created_at"),
    durationMs: requireInteger(row, "duration_ms"),
    id,
    mediaJobId: requireUuid(row, "media_job_id"),
    mimeType: "audio/wav" as const,
    objectPath,
    organizationId,
    outputSpecId: requireUuid(row, "output_spec_id"),
    productionPackageId,
    sampleRateHz: 16_000 as const,
    sha256: requireHash(row, "sha256"),
    successfulAttemptId: requireUuid(row, "successful_attempt_id"),
    validatedAt: requireString(row, "validated_at"),
    validationSchemaId: "strongr.media_validation.v1" as const,
  });
}

function mediaArtifactSelect(): string {
  return [
    "id",
    "organization_id",
    "media_job_id",
    "production_package_id",
    "output_spec_id",
    "successful_attempt_id",
    "bucket_id",
    "object_path",
    "mime_type",
    "container",
    "codec",
    "channels",
    "sample_rate_hz",
    "bits_per_sample",
    "duration_ms",
    "byte_count",
    "sha256",
    "validation_schema_id",
    "validated_at",
    "created_at",
  ].join(",");
}

function encodeMediaObjectPath(objectPath: string): string {
  return objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export class StudioSupabaseGateway implements StudioCommandGateway {
  readonly #accessToken: string;
  readonly #environment: StudioEnvironment;
  readonly #fetch: StudioFetch;

  constructor(input: {
    readonly accessToken: string;
    readonly environment: StudioEnvironment;
    readonly fetch?: StudioFetch;
  }) {
    this.#accessToken = requireAccessToken(input.accessToken);
    this.#environment = input.environment;
    this.#fetch = input.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async invoke<Name extends BrowserCommandName>(
    command: Name,
    arguments_: BrowserCommandArguments[Name],
  ): Promise<BrowserCommandResult<Name>> {
    const response = await this.#fetch(`${this.#environment.supabaseUrl}/rest/v1/rpc/${command}`, {
      body: JSON.stringify(commandBody(command, arguments_)),
      headers: this.#headers(true),
      method: "POST",
    });
    return parseCommandResult(command, await readJson(response));
  }

  async listBriefs(organizationId: Uuid, limit = 50): Promise<readonly TenantBriefSummary[]> {
    const rows = await this.#readRows(
      "content_briefs",
      "id,organization_id,content_item_id,schema_id,payload_hash,created_at",
      organizationId,
      limit,
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireRecord(value, "brief");
        if (
          requireUuid(row, "organization_id") !== organizationId ||
          requireString(row, "schema_id") !== "strongr.audio_reflection_brief.v1"
        ) {
          throw new Error("Invalid tenant brief response");
        }
        return Object.freeze({
          contentItemId: requireUuid(row, "content_item_id"),
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          organizationId,
          payloadHash: requireHash(row, "payload_hash"),
          schemaId: "strongr.audio_reflection_brief.v1" as const,
        });
      }),
    );
  }

  async listCheckDefinitions(limit = 50): Promise<readonly CheckDefinitionSummary[]> {
    const rows = await this.#readRows(
      "check_definitions",
      "id,key,version,name,lane,blocks_approval",
      null,
      limit,
      "key.asc,version.asc",
    );
    const lanes: readonly CheckDefinitionLane[] = [
      "scripture",
      "pastoral",
      "editorial",
      "rights",
      "accessibility",
      "narration",
    ];
    return Object.freeze(
      rows.map((value) => {
        const row = requireRecord(value, "check definition");
        return Object.freeze({
          blocksApproval: requireBoolean(row, "blocks_approval"),
          id: requireUuid(row, "id"),
          key: requireString(row, "key"),
          lane: requireOneOf(row, "lane", lanes),
          name: requireString(row, "name"),
          version: requireInteger(row, "version"),
        });
      }),
    );
  }

  async listCheckRuns(organizationId: Uuid, limit = 50): Promise<readonly TenantCheckRunSummary[]> {
    const rows = await this.#readRows(
      "check_runs",
      [
        "id",
        "organization_id",
        "content_version_id",
        "engine_key",
        "engine_version",
        "status",
        "artifact_hash",
        "correlation_id",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    const statuses: readonly CheckRunStatus[] = ["completed", "failed"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "check run", organizationId);
        return Object.freeze({
          artifactHash: requireHash(row, "artifact_hash"),
          contentVersionId: requireUuid(row, "content_version_id"),
          correlationId: requireUuid(row, "correlation_id"),
          createdAt: requireString(row, "created_at"),
          engineKey: requireString(row, "engine_key"),
          engineVersion: requireString(row, "engine_version"),
          id: requireUuid(row, "id"),
          organizationId,
          status: requireOneOf(row, "status", statuses),
        });
      }),
    );
  }

  async listCheckResults(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantCheckResultSummary[]> {
    const rows = await this.#readRows(
      "check_results",
      [
        "id",
        "organization_id",
        "check_run_id",
        "check_definition_id",
        "outcome",
        "detail_code",
        "evidence",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    const outcomes: readonly CheckOutcome[] = ["pass", "warn", "fail", "error"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "check result", organizationId);
        return Object.freeze({
          checkDefinitionId: requireUuid(row, "check_definition_id"),
          checkRunId: requireUuid(row, "check_run_id"),
          createdAt: requireString(row, "created_at"),
          detailCode: requireString(row, "detail_code"),
          evidence: requireJsonObject(row.evidence, "evidence"),
          id: requireUuid(row, "id"),
          organizationId,
          outcome: requireOneOf(row, "outcome", outcomes),
        });
      }),
    );
  }

  async listGenerationJobs(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantGenerationJobSummary[]> {
    const rows = await this.#readRows(
      "generation_jobs",
      "id,organization_id,brief_id,state,attempt_count,output_hash,created_at,finished_at",
      organizationId,
      limit,
    );
    const allowedStates: readonly GenerationJobState[] = [
      "queued",
      "running",
      "succeeded",
      "failed",
      "dead_letter",
      "cancelled",
    ];
    return Object.freeze(
      rows.map((value) => {
        const row = requireRecord(value, "generation job");
        const state = requireString(row, "state");
        if (
          requireUuid(row, "organization_id") !== organizationId ||
          !allowedStates.includes(state as GenerationJobState)
        ) {
          throw new Error("Invalid tenant generation job response");
        }
        return Object.freeze({
          attemptCount: requireInteger(row, "attempt_count"),
          briefId: requireUuid(row, "brief_id"),
          createdAt: requireString(row, "created_at"),
          finishedAt: requireNullableString(row, "finished_at"),
          id: requireUuid(row, "id"),
          organizationId,
          outputHash: requireNullableHash(row, "output_hash"),
          state: state as GenerationJobState,
        });
      }),
    );
  }

  async listContentVersions(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantContentVersionSummary[]> {
    const rows = await this.#readRows(
      "content_versions",
      [
        "id",
        "organization_id",
        "content_item_id",
        "brief_id",
        "version_number",
        "schema_id",
        "payload",
        "payload_hash",
        "source",
        "source_job_id",
        "state",
        "created_at",
        "submitted_at",
      ].join(","),
      organizationId,
      limit,
    );
    const allowedSources: readonly ContentVersionSource[] = ["manual", "ai_assisted"];
    const allowedStates: readonly ContentVersionState[] = ["draft", "submitted", "superseded"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireRecord(value, "content version");
        const source = requireString(row, "source");
        const state = requireString(row, "state");
        const schemaId = requireString(row, "schema_id");
        if (
          requireUuid(row, "organization_id") !== organizationId ||
          !["strongr.audio_reflection.v1", "strongr.strongr_daily_audio_reflection.v2"].includes(
            schemaId,
          ) ||
          !allowedSources.includes(source as ContentVersionSource) ||
          !allowedStates.includes(state as ContentVersionState)
        ) {
          throw new Error("Invalid tenant content version response");
        }
        return Object.freeze({
          briefId: requireUuid(row, "brief_id"),
          contentItemId: requireUuid(row, "content_item_id"),
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          organizationId,
          payload: requireJsonValue(row.payload, "payload"),
          payloadHash: requireHash(row, "payload_hash"),
          schemaId: schemaId as TenantContentVersionSummary["schemaId"],
          source: source as ContentVersionSource,
          sourceJobId: requireNullableUuid(row, "source_job_id"),
          state: state as ContentVersionState,
          submittedAt: requireNullableString(row, "submitted_at"),
          versionNumber: requireInteger(row, "version_number"),
        });
      }),
    );
  }

  async listScriptureEvidence(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantScriptureEvidenceSummary[]> {
    const rows = await this.#readRows(
      "scripture_evidence",
      [
        "id",
        "organization_id",
        "content_version_id",
        "reference",
        "translation",
        "source_citation",
        "verification_status",
        "evidence_hash",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    const statuses: readonly ScriptureVerificationStatus[] = ["verified", "blocked"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "Scripture evidence", organizationId);
        return Object.freeze({
          contentVersionId: requireUuid(row, "content_version_id"),
          createdAt: requireString(row, "created_at"),
          evidenceHash: requireHash(row, "evidence_hash"),
          id: requireUuid(row, "id"),
          organizationId,
          reference: requireString(row, "reference"),
          sourceCitation: requireString(row, "source_citation"),
          translation: requireString(row, "translation"),
          verificationStatus: requireOneOf(row, "verification_status", statuses),
        });
      }),
    );
  }

  async listRightsSnapshots(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantRightsSnapshotSummary[]> {
    const rows = await this.#readRows(
      "rights_snapshots",
      "id,organization_id,content_version_id,status,source_summary,snapshot_hash,created_at",
      organizationId,
      limit,
    );
    const statuses: readonly RightsStatus[] = ["cleared", "blocked"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "rights snapshot", organizationId);
        return Object.freeze({
          contentVersionId: requireUuid(row, "content_version_id"),
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          organizationId,
          snapshotHash: requireHash(row, "snapshot_hash"),
          sourceSummary: requireString(row, "source_summary"),
          status: requireOneOf(row, "status", statuses),
        });
      }),
    );
  }

  async listReviewPolicies(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantReviewPolicySummary[]> {
    const rows = await this.#readRows(
      "review_policies",
      "id,organization_id,key,version,policy_hash,is_active,created_at",
      organizationId,
      limit,
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "review policy", organizationId);
        return Object.freeze({
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          isActive: requireBoolean(row, "is_active"),
          key: requireString(row, "key"),
          organizationId,
          policyHash: requireHash(row, "policy_hash"),
          version: requireInteger(row, "version"),
        });
      }),
    );
  }

  async listReviewDecisions(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantReviewDecisionSummary[]> {
    const rows = await this.#readRows(
      "review_decisions",
      "id,organization_id,content_version_id,lane,decision,reason_code,evidence,created_at",
      organizationId,
      limit,
    );
    const lanes: readonly ReviewLane[] = ["scripture", "theology", "editorial"];
    const decisions: readonly ReviewDecision[] = ["approved", "changes_requested", "rejected"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "review decision", organizationId);
        return Object.freeze({
          contentVersionId: requireUuid(row, "content_version_id"),
          createdAt: requireString(row, "created_at"),
          decision: requireOneOf(row, "decision", decisions),
          evidence: requireJsonObject(row.evidence, "evidence"),
          id: requireUuid(row, "id"),
          lane: requireOneOf(row, "lane", lanes),
          organizationId,
          reasonCode: requireString(row, "reason_code"),
        });
      }),
    );
  }

  async listApprovalSnapshots(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantApprovalSnapshotSummary[]> {
    const rows = await this.#readRows(
      "approval_snapshots",
      [
        "id",
        "organization_id",
        "content_version_id",
        "review_policy_id",
        "check_run_id",
        "scripture_evidence_id",
        "rights_snapshot_id",
        "version_payload_hash",
        "evidence_bundle_hash",
        "authentication_assurance",
        "reason_code",
        "approved_at",
      ].join(","),
      organizationId,
      limit,
      "approved_at.desc,id.desc",
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "approval snapshot", organizationId);
        if (requireString(row, "authentication_assurance") !== "aal2") {
          throw new Error("Invalid tenant approval snapshot response");
        }
        return Object.freeze({
          approvedAt: requireString(row, "approved_at"),
          authenticationAssurance: "aal2" as const,
          checkRunId: requireUuid(row, "check_run_id"),
          contentVersionId: requireUuid(row, "content_version_id"),
          evidenceBundleHash: requireHash(row, "evidence_bundle_hash"),
          id: requireUuid(row, "id"),
          organizationId,
          reasonCode: requireString(row, "reason_code"),
          reviewPolicyId: requireUuid(row, "review_policy_id"),
          rightsSnapshotId: requireUuid(row, "rights_snapshot_id"),
          scriptureEvidenceId: requireUuid(row, "scripture_evidence_id"),
          versionPayloadHash: requireHash(row, "version_payload_hash"),
        });
      }),
    );
  }

  async listApprovalRevocations(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantApprovalRevocationSummary[]> {
    const rows = await this.#readRows(
      "approval_revocations",
      "id,organization_id,approval_snapshot_id,reason_code,revoked_at",
      organizationId,
      limit,
      "revoked_at.desc,id.desc",
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "approval revocation", organizationId);
        return Object.freeze({
          approvalSnapshotId: requireUuid(row, "approval_snapshot_id"),
          id: requireUuid(row, "id"),
          organizationId,
          reasonCode: requireString(row, "reason_code"),
          revokedAt: requireString(row, "revoked_at"),
        });
      }),
    );
  }

  async listProductionPackages(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantProductionPackageSummary[]> {
    const rows = await this.#readRows(
      "production_packages",
      [
        "id",
        "organization_id",
        "approval_snapshot_id",
        "manifest_schema_id",
        "manifest",
        "manifest_hash",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "production package", organizationId);
        if (requireString(row, "manifest_schema_id") !== "strongr.production_package.v1") {
          throw new Error("Invalid tenant production package response");
        }
        return Object.freeze({
          approvalSnapshotId: requireUuid(row, "approval_snapshot_id"),
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          manifest: requireJsonObject(row.manifest, "manifest"),
          manifestHash: requireHash(row, "manifest_hash"),
          manifestSchemaId: "strongr.production_package.v1" as const,
          organizationId,
        });
      }),
    );
  }

  async getMediaArtifact(
    organizationId: Uuid,
    mediaArtifactId: Uuid,
  ): Promise<TenantMediaArtifactSummary> {
    const parameters = new URLSearchParams({
      id: `eq.${mediaArtifactId}`,
      limit: "1",
      organization_id: `eq.${organizationId}`,
      select: mediaArtifactSelect(),
    });
    const response = await this.#fetch(
      `${this.#environment.supabaseUrl}/rest/v1/media_artifacts?${parameters.toString()}`,
      {
        headers: this.#headers(false),
        method: "GET",
      },
    );
    const value = await readJson(response);
    if (!Array.isArray(value) || value.length !== 1) {
      throw new StudioApiError(404, "media_artifact_not_found");
    }
    return parseMediaArtifact(value[0], organizationId);
  }

  async downloadMediaArtifact(
    organizationId: Uuid,
    mediaArtifactId: Uuid,
  ): Promise<VerifiedMediaArtifactDownload> {
    const artifact = await this.getMediaArtifact(organizationId, mediaArtifactId);
    const response = await this.#fetch(
      `${this.#environment.supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(
        artifact.bucketId,
      )}/${encodeMediaObjectPath(artifact.objectPath)}`,
      {
        cache: "no-store",
        headers: {
          accept: artifact.mimeType,
          apikey: this.#environment.supabasePublishableKey,
          authorization: `Bearer ${this.#accessToken}`,
        },
        method: "GET",
      },
    );
    if (!response.ok) {
      if (response.status === 404) {
        throw new StudioApiError(404, "media_object_not_found");
      }
      throw new StudioApiError(response.status, "storage_download_failed");
    }
    if (response.headers.get("content-type")?.split(";")[0]?.trim() !== artifact.mimeType) {
      throw new StudioApiError(422, "media_content_type_mismatch");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== artifact.byteCount) {
      throw new StudioApiError(422, "media_byte_count_mismatch");
    }
    const observedSha256 = await sha256Hex(bytes);
    if (observedSha256 !== artifact.sha256) {
      throw new StudioApiError(422, "media_checksum_mismatch");
    }
    return Object.freeze({
      artifact,
      bytes,
      sha256: observedSha256,
    });
  }

  async listMediaOutputSpecs(limit = 50): Promise<readonly MediaOutputSpecSummary[]> {
    const rows = await this.#readRows(
      "media_output_specs",
      [
        "id",
        "key",
        "version",
        "media_kind",
        "container",
        "codec",
        "mime_type",
        "channels",
        "sample_rate_hz",
        "bits_per_sample",
        "max_duration_ms",
        "max_bytes",
        "spec_hash",
        "created_at",
      ].join(","),
      null,
      limit,
      "key.asc,version.asc",
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireRecord(value, "media output specification");
        if (
          requireString(row, "key") !== "strongr.synthetic_audio" ||
          requireInteger(row, "version") !== 1 ||
          requireString(row, "media_kind") !== "audio" ||
          requireString(row, "container") !== "wav" ||
          requireString(row, "codec") !== "pcm_s16le" ||
          requireString(row, "mime_type") !== "audio/wav" ||
          requireInteger(row, "channels") !== 1 ||
          requireInteger(row, "sample_rate_hz") !== 16_000 ||
          requireInteger(row, "bits_per_sample") !== 16 ||
          requireInteger(row, "max_duration_ms") !== 900_000 ||
          requireInteger(row, "max_bytes") !== 26_214_400
        ) {
          throw new Error("Invalid media output specification response");
        }
        return Object.freeze({
          bitsPerSample: 16 as const,
          channels: 1 as const,
          codec: "pcm_s16le" as const,
          container: "wav" as const,
          createdAt: requireString(row, "created_at"),
          id: requireUuid(row, "id"),
          key: "strongr.synthetic_audio" as const,
          maxBytes: 26_214_400 as const,
          maxDurationMs: 900_000 as const,
          mediaKind: "audio" as const,
          mimeType: "audio/wav" as const,
          sampleRateHz: 16_000 as const,
          specHash: requireHash(row, "spec_hash"),
          version: 1 as const,
        });
      }),
    );
  }

  async listMediaJobs(organizationId: Uuid, limit = 50): Promise<readonly TenantMediaJobSummary[]> {
    const rows = await this.#readRows(
      "media_jobs",
      [
        "id",
        "organization_id",
        "production_package_id",
        "output_spec_id",
        "requested_by_membership_id",
        "adapter_key",
        "adapter_version",
        "request_schema_id",
        "input_hash",
        "correlation_id",
        "state",
        "attempt_count",
        "max_attempts",
        "available_at",
        "started_at",
        "finished_at",
        "last_error_code",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    const states: readonly MediaJobState[] = [
      "queued",
      "running",
      "succeeded",
      "failed",
      "dead_letter",
      "cancelled",
    ];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "media job", organizationId);
        if (requireString(row, "request_schema_id") !== "strongr.media_request.v1") {
          throw new Error("Invalid tenant media job response");
        }
        return Object.freeze({
          adapterKey: requireString(row, "adapter_key"),
          adapterVersion: requireString(row, "adapter_version"),
          attemptCount: requireInteger(row, "attempt_count"),
          availableAt: requireString(row, "available_at"),
          correlationId: requireUuid(row, "correlation_id"),
          createdAt: requireString(row, "created_at"),
          finishedAt: requireNullableString(row, "finished_at"),
          id: requireUuid(row, "id"),
          inputHash: requireHash(row, "input_hash"),
          lastErrorCode: requireNullableString(row, "last_error_code"),
          maxAttempts: requireInteger(row, "max_attempts"),
          organizationId,
          outputSpecId: requireUuid(row, "output_spec_id"),
          productionPackageId: requireUuid(row, "production_package_id"),
          requestSchemaId: "strongr.media_request.v1" as const,
          requestedByMembershipId: requireUuid(row, "requested_by_membership_id"),
          startedAt: requireNullableString(row, "started_at"),
          state: requireOneOf(row, "state", states),
        });
      }),
    );
  }

  async listMediaArtifacts(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantMediaArtifactSummary[]> {
    const rows = await this.#readRows(
      "media_artifacts",
      mediaArtifactSelect(),
      organizationId,
      limit,
    );
    return Object.freeze(rows.map((value) => parseMediaArtifact(value, organizationId)));
  }

  async listMediaReviews(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantMediaReviewSummary[]> {
    const rows = await this.#readRows(
      "media_reviews",
      [
        "id",
        "organization_id",
        "media_artifact_id",
        "reviewer_membership_id",
        "decision",
        "transcript_status",
        "accessibility_status",
        "reason_code",
        "evidence",
        "evidence_hash",
        "created_at",
      ].join(","),
      organizationId,
      limit,
    );
    const decisions: readonly MediaReviewDecision[] = ["approved", "changes_requested", "rejected"];
    const transcripts: readonly MediaTranscriptStatus[] = ["ready", "blocked"];
    const accessibility: readonly MediaAccessibilityStatus[] = ["approved", "blocked"];
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "media review", organizationId);
        return Object.freeze({
          accessibilityStatus: requireOneOf(row, "accessibility_status", accessibility),
          createdAt: requireString(row, "created_at"),
          decision: requireOneOf(row, "decision", decisions),
          evidence: requireJsonObject(row.evidence, "evidence"),
          evidenceHash: requireHash(row, "evidence_hash"),
          id: requireUuid(row, "id"),
          mediaArtifactId: requireUuid(row, "media_artifact_id"),
          organizationId,
          reasonCode: requireString(row, "reason_code"),
          reviewerMembershipId: requireUuid(row, "reviewer_membership_id"),
          transcriptStatus: requireOneOf(row, "transcript_status", transcripts),
        });
      }),
    );
  }

  async listStagedReleaseBundles(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantStagedReleaseBundleSummary[]> {
    const rows = await this.#readRows(
      "staged_release_bundles",
      [
        "id",
        "organization_id",
        "production_package_id",
        "media_artifact_id",
        "media_review_id",
        "manifest_schema_id",
        "manifest",
        "manifest_hash",
        "staged_by_membership_id",
        "authentication_assurance",
        "staged_at",
      ].join(","),
      organizationId,
      limit,
      "staged_at.desc,id.desc",
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "staged release bundle", organizationId);
        if (
          requireString(row, "manifest_schema_id") !== "strongr.staged_release_bundle.v1" ||
          requireString(row, "authentication_assurance") !== "aal2"
        ) {
          throw new Error("Invalid tenant staged release bundle response");
        }
        return Object.freeze({
          authenticationAssurance: "aal2" as const,
          id: requireUuid(row, "id"),
          manifest: requireJsonObject(row.manifest, "manifest"),
          manifestHash: requireHash(row, "manifest_hash"),
          manifestSchemaId: "strongr.staged_release_bundle.v1" as const,
          mediaArtifactId: requireUuid(row, "media_artifact_id"),
          mediaReviewId: requireUuid(row, "media_review_id"),
          organizationId,
          productionPackageId: requireUuid(row, "production_package_id"),
          stagedAt: requireString(row, "staged_at"),
          stagedByMembershipId: requireUuid(row, "staged_by_membership_id"),
        });
      }),
    );
  }

  async listStagedReleaseRevocations(
    organizationId: Uuid,
    limit = 50,
  ): Promise<readonly TenantStagedReleaseRevocationSummary[]> {
    const rows = await this.#readRows(
      "staged_release_revocations",
      [
        "id",
        "organization_id",
        "staged_release_bundle_id",
        "revoked_by_membership_id",
        "reason_code",
        "authentication_assurance",
        "revoked_at",
      ].join(","),
      organizationId,
      limit,
      "revoked_at.desc,id.desc",
    );
    return Object.freeze(
      rows.map((value) => {
        const row = requireTenantRow(value, "staged release revocation", organizationId);
        if (requireString(row, "authentication_assurance") !== "aal2") {
          throw new Error("Invalid tenant staged release revocation response");
        }
        return Object.freeze({
          authenticationAssurance: "aal2" as const,
          id: requireUuid(row, "id"),
          organizationId,
          reasonCode: requireString(row, "reason_code"),
          revokedAt: requireString(row, "revoked_at"),
          revokedByMembershipId: requireUuid(row, "revoked_by_membership_id"),
          stagedReleaseBundleId: requireUuid(row, "staged_release_bundle_id"),
        });
      }),
    );
  }

  async #readRows(
    table: string,
    select: string,
    organizationId: Uuid | null,
    limit: number,
    order = "created_at.desc,id.desc",
  ): Promise<readonly unknown[]> {
    const parameters = new URLSearchParams({
      limit: String(requireLimit(limit)),
      order,
      select,
      ...(organizationId === null ? {} : { organization_id: `eq.${organizationId}` }),
    });
    const response = await this.#fetch(
      `${this.#environment.supabaseUrl}/rest/v1/${table}?${parameters.toString()}`,
      {
        headers: this.#headers(false),
        method: "GET",
      },
    );
    const value = await readJson(response);
    if (!Array.isArray(value)) {
      throw new Error(`Invalid ${table} response`);
    }
    return value;
  }

  #headers(includeContentType: boolean): Readonly<Record<string, string>> {
    return Object.freeze({
      accept: "application/json",
      apikey: this.#environment.supabasePublishableKey,
      authorization: `Bearer ${this.#accessToken}`,
      ...(includeContentType ? { "content-type": "application/json" } : {}),
    });
  }
}

export function createStudioSupabaseGateway(input: {
  readonly accessToken: string;
  readonly environment: StudioEnvironment;
  readonly fetch?: StudioFetch;
}): StudioSupabaseGateway {
  return new StudioSupabaseGateway(input);
}
