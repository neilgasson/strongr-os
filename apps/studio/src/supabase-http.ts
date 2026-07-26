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
  TenantProductionPackageSummary,
  TenantReviewDecisionSummary,
  TenantReviewPolicySummary,
  TenantRightsSnapshotSummary,
  TenantScriptureEvidenceSummary,
  Uuid,
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
    this.#fetch = input.fetch ?? globalThis.fetch;
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
        if (
          requireUuid(row, "organization_id") !== organizationId ||
          requireString(row, "schema_id") !== "strongr.audio_reflection.v1" ||
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
          schemaId: "strongr.audio_reflection.v1" as const,
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
