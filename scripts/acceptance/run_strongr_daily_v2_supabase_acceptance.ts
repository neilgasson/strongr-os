#!/usr/bin/env -S node --experimental-strip-types

import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  databaseCommandDiagnostic,
  type DatabaseCommandDiagnostic,
} from "./database-command-diagnostics.ts";
import { createStrongrDailyApprovedExport } from "../../apps/studio/src/strongr-daily-export.ts";
import {
  AutomatedReviewCheckRunner,
  SupabaseReviewCheckStore,
  SupabaseRpcClient,
  SupabaseRpcError,
  type WorkerEnvironment,
} from "../../apps/worker/src/index.ts";
import { createStrongrDailyV2FixtureOutput } from "../../packages/ai/src/deterministic-adapter.ts";
import {
  createGenerationOutputHash,
  deterministicGenerationAdapter,
} from "../../packages/ai/src/index.ts";
import type {
  CheckDefinitionSummary,
  JsonObject,
  TenantProductionPackageSummary,
  Uuid,
} from "../../packages/contracts/src/index.ts";
import {
  audioReflectionBriefFixture,
  strongrDailyAudioReflectionV2BriefFixture,
} from "../../packages/testing/src/index.ts";

type EvidenceStatus = "pass" | "fail";
type UnknownRecord = Readonly<Record<string, unknown>>;

interface EvidenceRecord {
  readonly test: string;
  readonly status: EvidenceStatus;
  readonly [name: string]: boolean | number | string | null;
}

interface AcceptanceConfig {
  readonly artifactPath: string;
  readonly databaseUrl: string;
  readonly projectRef: string;
  readonly publishableKey: string;
  readonly serviceRoleKey: string;
  readonly supabaseUrl: string;
  readonly target: "strongr-os-disposable";
  readonly workerId: string;
}

interface Fixture {
  readonly membershipOne: Uuid;
  readonly membershipTwo: Uuid;
  readonly organizationOne: Uuid;
  readonly organizationTwo: Uuid;
  readonly roleOne: Uuid;
  readonly roleTwo: Uuid;
  readonly runId: string;
  userOne: Uuid;
  userTwo: Uuid;
}

interface ClaimedGeneration {
  readonly eventId: Uuid;
  readonly leaseToken: Uuid;
}

interface BegunGeneration {
  readonly attemptId: Uuid;
  readonly brief: UnknownRecord;
}

interface GeneratedVersion {
  readonly id: Uuid;
  readonly payload: UnknownRecord;
  readonly payloadHash: string;
  readonly schemaId: string;
}

class AcceptanceFailure extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AcceptanceFailure";
    this.code = code;
  }
}

class AcceptanceHttpFailure extends Error {
  readonly databaseCode: string | null;
  readonly status: number;

  constructor(status: number, databaseCode: string | null) {
    super(`HTTP ${status}`);
    this.name = "AcceptanceHttpFailure";
    this.databaseCode = databaseCode;
    this.status = status;
  }
}

class DatabaseCommandFailure extends AcceptanceFailure {
  readonly diagnostic: DatabaseCommandDiagnostic;

  constructor(diagnostic: DatabaseCommandDiagnostic) {
    super("database_command_failed");
    this.name = "DatabaseCommandFailure";
    this.diagnostic = diagnostic;
  }
}

const evidence: EvidenceRecord[] = [];
const runStartedAt = new Date().toISOString();

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AcceptanceFailure(`missing_${name.toLowerCase()}`);
  return value;
}

function databaseMatchesProject(databaseUrl: string, projectRef: string): boolean {
  const parsed = new URL(databaseUrl);
  return (
    parsed.hostname.toLowerCase() === `db.${projectRef}.supabase.co` ||
    decodeURIComponent(parsed.username).endsWith(`.${projectRef}`)
  );
}

function loadConfig(): AcceptanceConfig {
  const target = requireEnvironment("STRONGR_OS_M1_ACCEPTANCE_TARGET");
  if (target !== "strongr-os-disposable") {
    throw new AcceptanceFailure("invalid_acceptance_target");
  }
  const projectRef = requireEnvironment("STRONGR_OS_PROJECT_REF");
  const supabaseUrl = requireEnvironment("STRONGR_OS_SUPABASE_URL").replace(/\/$/, "");
  const publishableKey = requireEnvironment("STRONGR_OS_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = requireEnvironment("STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY");
  const databaseUrl = requireEnvironment("STRONGR_OS_DATABASE_URL");
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new AcceptanceFailure("invalid_project_ref");
  }
  const api = new URL(supabaseUrl);
  if (
    api.protocol !== "https:" ||
    api.hostname.toLowerCase() !== `${projectRef}.supabase.co` ||
    !databaseMatchesProject(databaseUrl, projectRef)
  ) {
    throw new AcceptanceFailure("remote_project_mismatch");
  }
  if (
    !publishableKey.startsWith("sb_publishable_") ||
    serviceRoleKey.length < 32 ||
    serviceRoleKey === publishableKey
  ) {
    throw new AcceptanceFailure("invalid_api_key_configuration");
  }
  return Object.freeze({
    artifactPath: resolve(
      process.env.STRONGR_OS_V2_ACCEPTANCE_ARTIFACT?.trim() ||
        "artifacts/acceptance/strongr-daily-v2.json",
    ),
    databaseUrl,
    projectRef,
    publishableKey,
    serviceRoleKey,
    supabaseUrl,
    target,
    workerId: `strongr-daily-v2-${randomUUID().replaceAll("-", "").slice(0, 24)}`,
  });
}

function addEvidence(
  test: string,
  condition: boolean,
  details: Omit<EvidenceRecord, "status" | "test"> = {},
): void {
  evidence.push({ ...details, status: condition ? "pass" : "fail", test });
  if (!condition) throw new AcceptanceFailure(test);
}

function requireRecord(value: unknown, name: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AcceptanceFailure(`invalid_${name}`);
  }
  return value as UnknownRecord;
}

function requireArray(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new AcceptanceFailure(`invalid_${name}`);
  return value;
}

function requireString(record: UnknownRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new AcceptanceFailure(`invalid_${key}`);
  }
  return value;
}

function requireUuid(value: unknown, name: string): Uuid {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new AcceptanceFailure(`invalid_${name}`);
  }
  return value;
}

function safeDatabaseCode(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    /^[A-Z0-9]{5}$/.test(value.code)
  ) {
    return value.code;
  }
  return null;
}

function deepEqualJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function serviceHeaders(config: AcceptanceConfig, body: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    apikey: config.serviceRoleKey,
  };
  if (!config.serviceRoleKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${config.serviceRoleKey}`;
  }
  if (body) headers["Content-Type"] = "application/json";
  return headers;
}

async function httpJson(
  config: AcceptanceConfig,
  method: string,
  path: string,
  input: {
    readonly apiKey: string;
    readonly bearer?: string;
    readonly body?: unknown;
    readonly service?: boolean;
  },
): Promise<unknown> {
  const headers = input.service
    ? serviceHeaders(config, input.body !== undefined)
    : {
        Accept: "application/json",
        apikey: input.apiKey,
        ...(input.bearer ? { Authorization: `Bearer ${input.bearer}` } : {}),
        ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      };
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    headers,
    method,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    throw new AcceptanceHttpFailure(response.status, safeDatabaseCode(payload));
  }
  return payload;
}

async function userRpc(
  config: AcceptanceConfig,
  token: string,
  name: string,
  body: UnknownRecord,
): Promise<unknown> {
  return httpJson(config, "POST", `/rest/v1/rpc/${encodeURIComponent(name)}`, {
    apiKey: config.publishableKey,
    bearer: token,
    body,
  });
}

async function restRows(
  config: AcceptanceConfig,
  token: string,
  table: string,
  query: string,
): Promise<readonly UnknownRecord[]> {
  const payload = await httpJson(config, "GET", `/rest/v1/${encodeURIComponent(table)}?${query}`, {
    apiKey: config.publishableKey,
    bearer: token,
  });
  return requireArray(payload, `${table}_rows`).map((row) => requireRecord(row, table));
}

async function httpDenied(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
  } catch (error) {
    return (
      error instanceof AcceptanceHttpFailure &&
      (error.databaseCode === "42501" || [401, 403, 404].includes(error.status))
    );
  }
  return false;
}

async function stateDenied(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action();
  } catch (error) {
    return (
      (error instanceof AcceptanceHttpFailure &&
        ["22023", "23503", "42501", "55000"].includes(error.databaseCode ?? "")) ||
      (error instanceof SupabaseRpcError &&
        (["22023", "23503", "42501", "55000"].includes(error.databaseCode ?? "") ||
          [401, 403, 404].includes(error.status)))
    );
  }
  return false;
}

function runPsql(
  config: AcceptanceConfig,
  lifecycleStep: string,
  command: string,
  sql: string,
): string {
  const completed = spawnSync(
    "psql",
    [
      config.databaseUrl,
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "VERBOSITY=verbose",
    ],
    {
      encoding: "utf8",
      input: sql,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (completed.status !== 0) {
    throw new DatabaseCommandFailure(
      databaseCommandDiagnostic({
        command,
        lifecycleStep,
        stderr: `${completed.stderr ?? ""}\n${completed.error?.message ?? ""}`,
      }),
    );
  }
  return completed.stdout.trim();
}

async function createUser(
  config: AcceptanceConfig,
  email: string,
  password: string,
): Promise<Uuid> {
  const payload = requireRecord(
    await httpJson(config, "POST", "/auth/v1/admin/users", {
      apiKey: config.serviceRoleKey,
      body: {
        email,
        email_confirm: true,
        password,
        user_metadata: { purpose: "strongr-daily-v2-acceptance" },
      },
      service: true,
    }),
    "admin_user",
  );
  return requireUuid(payload.id, "user_id");
}

async function deleteUser(config: AcceptanceConfig, userId: Uuid): Promise<void> {
  try {
    await httpJson(config, "DELETE", `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      apiKey: config.serviceRoleKey,
      service: true,
    });
  } catch (error) {
    if (!(error instanceof AcceptanceHttpFailure) || error.status !== 404) throw error;
  }
}

async function signIn(config: AcceptanceConfig, email: string, password: string): Promise<string> {
  const payload = requireRecord(
    await httpJson(config, "POST", "/auth/v1/token?grant_type=password", {
      apiKey: config.publishableKey,
      body: { email, password },
    }),
    "sign_in",
  );
  return requireString(payload, "access_token");
}

function jwtClaims(token: string): UnknownRecord {
  const encoded = token.split(".")[1];
  if (!encoded) throw new AcceptanceFailure("invalid_access_token");
  return requireRecord(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")), "jwt");
}

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.replaceAll(" ", "").replaceAll("=", "").toUpperCase();
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new AcceptanceFailure("invalid_totp_secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string): string {
  const counter = Math.floor(Date.now() / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function promoteToAal2(
  config: AcceptanceConfig,
  accessToken: string,
  friendlyName: string,
): Promise<string> {
  const enrollment = requireRecord(
    await httpJson(config, "POST", "/auth/v1/factors", {
      apiKey: config.publishableKey,
      bearer: accessToken,
      body: { factor_type: "totp", friendly_name: friendlyName },
    }),
    "factor_enrollment",
  );
  const factorId = requireUuid(enrollment.id, "factor_id");
  const secret = requireString(requireRecord(enrollment.totp, "totp"), "secret");
  const challenge = requireRecord(
    await httpJson(config, "POST", `/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`, {
      apiKey: config.publishableKey,
      bearer: accessToken,
      body: {},
    }),
    "factor_challenge",
  );
  const challengeId = requireUuid(challenge.id, "challenge_id");
  const remainingMilliseconds = 30_000 - (Date.now() % 30_000);
  if (remainingMilliseconds <= 3_000) await delay(remainingMilliseconds + 250);
  const verified = requireRecord(
    await httpJson(config, "POST", `/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, {
      apiKey: config.publishableKey,
      bearer: accessToken,
      body: { challenge_id: challengeId, code: generateTotp(secret) },
    }),
    "factor_verification",
  );
  return requireString(verified, "access_token");
}

function seedDatabase(config: AcceptanceConfig, fixture: Fixture): void {
  runPsql(
    config,
    "v2_fixture_database_seed",
    "fixture_database_seed",
    `
begin;
insert into public.organizations (id, name, slug) values
  ('${fixture.organizationOne}', 'Strongr Daily v2 acceptance one', 'sd-v2-${fixture.runId}-one'),
  ('${fixture.organizationTwo}', 'Strongr Daily v2 acceptance two', 'sd-v2-${fixture.runId}-two');
insert into public.profiles (id, display_name) values
  ('${fixture.userOne}', 'Strongr Daily v2 operator one'),
  ('${fixture.userTwo}', 'Strongr Daily v2 operator two');
insert into public.memberships (id, organization_id, profile_id) values
  ('${fixture.membershipOne}', '${fixture.organizationOne}', '${fixture.userOne}'),
  ('${fixture.membershipTwo}', '${fixture.organizationTwo}', '${fixture.userTwo}');
insert into public.roles (id, organization_id, key, name) values
  ('${fixture.roleOne}', '${fixture.organizationOne}', 'owner', 'Owner'),
  ('${fixture.roleTwo}', '${fixture.organizationTwo}', 'owner', 'Owner');
insert into public.membership_role_grants (
  organization_id, membership_id, role_id, granted_by_membership_id
) values
  ('${fixture.organizationOne}', '${fixture.membershipOne}', '${fixture.roleOne}', '${fixture.membershipOne}'),
  ('${fixture.organizationTwo}', '${fixture.membershipTwo}', '${fixture.roleTwo}', '${fixture.membershipTwo}');
insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select seed.organization_id, seed.role_id, permission.id, seed.membership_id
from (values
  ('${fixture.organizationOne}'::uuid, '${fixture.roleOne}'::uuid, '${fixture.membershipOne}'::uuid),
  ('${fixture.organizationTwo}'::uuid, '${fixture.roleTwo}'::uuid, '${fixture.membershipTwo}'::uuid)
) seed(organization_id, role_id, membership_id)
cross join public.permissions as permission;
commit;
`,
  );
}

function cleanupDatabase(config: AcceptanceConfig, fixture: Fixture): void {
  runPsql(
    config,
    "v2_fixture_database_cleanup",
    "fixture_database_cleanup",
    `
select set_config(
  'strongr_daily_v2_acceptance.org_ids',
  '${fixture.organizationOne},${fixture.organizationTwo}',
  false
);
set session_replication_role = replica;
delete from app_private.m1_generation_attempt_claims
where organization_id = any(
  string_to_array(current_setting('strongr_daily_v2_acceptance.org_ids'), ',')::uuid[]
);
do $cleanup$
declare
  v_table record;
  v_organization_id uuid;
begin
  foreach v_organization_id in array string_to_array(
    current_setting('strongr_daily_v2_acceptance.org_ids'), ','
  )::uuid[]
  loop
    for v_table in
      select distinct column_info.table_name
      from information_schema.columns as column_info
      join information_schema.tables as table_info
        on table_info.table_schema = column_info.table_schema
       and table_info.table_name = column_info.table_name
      where column_info.table_schema = 'public'
        and column_info.column_name = 'organization_id'
        and table_info.table_type = 'BASE TABLE'
      order by column_info.table_name
    loop
      execute format(
        'delete from public.%I where organization_id = $1',
        v_table.table_name
      ) using v_organization_id;
    end loop;
    delete from public.organizations where id = v_organization_id;
  end loop;
end;
$cleanup$;
delete from public.worker_heartbeats where worker_id = '${config.workerId}';
delete from public.profiles where id in ('${fixture.userOne}', '${fixture.userTwo}');
set session_replication_role = origin;
`,
  );
}

function createWorkerEnvironment(config: AcceptanceConfig): WorkerEnvironment {
  return Object.freeze({
    privilegedKeyKind: config.serviceRoleKey.startsWith("sb_secret_")
      ? "secret"
      : "legacy_service_role",
    supabasePrivilegedKey: config.serviceRoleKey,
    supabaseUrl: config.supabaseUrl,
    workerId: config.workerId,
  });
}

async function createBrief(
  config: AcceptanceConfig,
  token: string,
  organizationId: Uuid,
  title: string,
  payload: UnknownRecord,
): Promise<{ readonly briefId: Uuid; readonly contentItemId: Uuid }> {
  const rows = requireArray(
    await userRpc(config, token, "m1_create_audio_brief", {
      p_correlation_id: randomUUID(),
      p_organization_id: organizationId,
      p_payload: payload,
      p_title: title,
    }),
    "create_brief",
  );
  const row = requireRecord(rows[0], "create_brief_result");
  return Object.freeze({
    briefId: requireUuid(row.brief_id, "brief_id"),
    contentItemId: requireUuid(row.content_item_id, "content_item_id"),
  });
}

async function requestGeneration(
  config: AcceptanceConfig,
  token: string,
  organizationId: Uuid,
  briefId: Uuid,
  runId: string,
  suffix: string,
): Promise<Uuid> {
  return requireUuid(
    await userRpc(config, token, "m1_request_generation", {
      p_brief_id: briefId,
      p_correlation_id: randomUUID(),
      p_idempotency_key: `sd-v2-${runId}-${suffix}`,
      p_organization_id: organizationId,
      p_prompt_key: "strongr.strongr_daily.fixture",
      p_prompt_version: 2,
    }),
    "generation_job_id",
  );
}

async function claimGeneration(
  service: SupabaseRpcClient,
  workerId: string,
  generationJobId: Uuid,
): Promise<ClaimedGeneration> {
  const claimed = requireArray(
    await service.rpc<unknown>("m1_claim_generation_events", {
      p_batch_size: 10,
      p_lease_seconds: 120,
      p_worker_id: workerId,
    }),
    "claimed_generation_events",
  ).map((row) => requireRecord(row, "claimed_generation_event"));
  const event = claimed.find((row) => row.aggregate_id === generationJobId);
  if (!event) throw new AcceptanceFailure("generation_event_not_claimed");
  return Object.freeze({
    eventId: requireUuid(event.event_id, "event_id"),
    leaseToken: requireUuid(event.lease_token, "lease_token"),
  });
}

async function beginGeneration(
  service: SupabaseRpcClient,
  workerId: string,
  claimed: ClaimedGeneration,
): Promise<BegunGeneration> {
  const rows = requireArray(
    await service.rpc<unknown>("m1_begin_generation_attempt", {
      p_event_id: claimed.eventId,
      p_lease_token: claimed.leaseToken,
      p_model: "strongr.fixture.audio-reflection.v2",
      p_provider: "deterministic-test",
      p_worker_id: workerId,
    }),
    "begin_generation",
  );
  const row = requireRecord(rows[0], "begin_generation_result");
  return Object.freeze({
    attemptId: requireUuid(row.attempt_id, "attempt_id"),
    brief: requireRecord(row.brief, "generation_brief"),
  });
}

async function completeGeneration(
  service: SupabaseRpcClient,
  workerId: string,
  claimed: ClaimedGeneration,
  begun: BegunGeneration,
  responseSchemaId: string,
  output: UnknownRecord,
  outputHash: string,
  responseId: string,
): Promise<Uuid> {
  const rows = requireArray(
    await service.rpc<unknown>("m1_complete_generation_attempt", {
      p_attempt_id: begun.attemptId,
      p_event_id: claimed.eventId,
      p_latency_ms: 1,
      p_lease_token: claimed.leaseToken,
      p_output: output as JsonObject,
      p_output_hash: outputHash,
      p_provider_response_id: responseId,
      p_response_schema_id: responseSchemaId,
      p_worker_id: workerId,
    }),
    "complete_generation",
  );
  const row = requireRecord(rows[0], "complete_generation_result");
  const contentVersionId = requireUuid(row.content_version_id, "content_version_id");
  await service.rpc("m0_ack_outbox_event", {
    p_delivery_key: `generation-${claimed.eventId}`,
    p_event_id: claimed.eventId,
    p_lease_token: claimed.leaseToken,
    p_worker_id: workerId,
  });
  return contentVersionId;
}

async function loadVersion(
  config: AcceptanceConfig,
  token: string,
  organizationId: Uuid,
  versionId: Uuid,
): Promise<GeneratedVersion> {
  const query = new URLSearchParams({
    id: `eq.${versionId}`,
    organization_id: `eq.${organizationId}`,
    select: "id,schema_id,payload,payload_hash",
  }).toString();
  const rows = await restRows(config, token, "content_versions", query);
  const row = rows[0];
  if (!row) throw new AcceptanceFailure("content_version_missing");
  return Object.freeze({
    id: requireUuid(row.id, "content_version_id"),
    payload: requireRecord(row.payload, "content_payload"),
    payloadHash: requireString(row, "payload_hash"),
    schemaId: requireString(row, "schema_id"),
  });
}

async function submitVersion(
  config: AcceptanceConfig,
  token: string,
  organizationId: Uuid,
  versionId: Uuid,
): Promise<void> {
  await userRpc(config, token, "m1_submit_version", {
    p_content_version_id: versionId,
    p_correlation_id: randomUUID(),
    p_organization_id: organizationId,
  });
}

function checkDefinitions(rows: readonly UnknownRecord[]): readonly CheckDefinitionSummary[] {
  return Object.freeze(
    rows.map((row) =>
      Object.freeze({
        blocksApproval: row.blocks_approval === true,
        id: requireUuid(row.id, "check_definition_id"),
        key: requireString(row, "key"),
        lane: requireString(row, "lane") as CheckDefinitionSummary["lane"],
        name: requireString(row, "name"),
        version:
          typeof row.version === "number" && Number.isInteger(row.version)
            ? row.version
            : (() => {
                throw new AcceptanceFailure("invalid_check_definition_version");
              })(),
      }),
    ),
  );
}

async function recordScriptureEvidence(
  config: AcceptanceConfig,
  token: string,
  organizationId: Uuid,
  versionId: Uuid,
): Promise<Uuid> {
  return requireUuid(
    await userRpc(config, token, "m1_record_scripture_evidence", {
      p_content_version_id: versionId,
      p_correlation_id: randomUUID(),
      p_organization_id: organizationId,
      p_reference: strongrDailyAudioReflectionV2BriefFixture.scripture_reference.reference,
      p_source_citation:
        strongrDailyAudioReflectionV2BriefFixture.scripture_reference.source_citation,
      p_translation: strongrDailyAudioReflectionV2BriefFixture.scripture_reference.translation,
      p_verification_status: "verified",
    }),
    "scripture_evidence_id",
  );
}

async function recordRights(
  config: AcceptanceConfig,
  token: string,
  organizationId: Uuid,
  versionId: Uuid,
): Promise<Uuid> {
  return requireUuid(
    await userRpc(config, token, "m1_record_rights_snapshot", {
      p_content_version_id: versionId,
      p_correlation_id: randomUUID(),
      p_organization_id: organizationId,
      p_source_summary: "KJV public-domain acceptance fixture; human verification recorded",
      p_status: "cleared",
    }),
    "rights_snapshot_id",
  );
}

async function recordReview(
  config: AcceptanceConfig,
  token: string,
  organizationId: Uuid,
  versionId: Uuid,
  lane: "editorial" | "scripture" | "theology",
): Promise<Uuid> {
  return requireUuid(
    await userRpc(config, token, "m1_record_review", {
      p_content_version_id: versionId,
      p_correlation_id: randomUUID(),
      p_decision: "approved",
      p_evidence: { fixture: "strongr_daily_v2_acceptance" },
      p_lane: lane,
      p_organization_id: organizationId,
      p_reason_code: "strongr_daily_v2_acceptance",
    }),
    `${lane}_review_id`,
  );
}

function approvalBody(input: {
  readonly checkRunId: Uuid;
  readonly editorialReviewId: Uuid;
  readonly organizationId: Uuid;
  readonly reviewPolicyId: Uuid;
  readonly rightsSnapshotId: Uuid;
  readonly scriptureEvidenceId: Uuid;
  readonly scriptureReviewId: Uuid;
  readonly theologyReviewId: Uuid;
  readonly versionId: Uuid;
}): JsonObject {
  return {
    p_check_run_id: input.checkRunId,
    p_content_version_id: input.versionId,
    p_correlation_id: randomUUID(),
    p_editorial_review_id: input.editorialReviewId,
    p_organization_id: input.organizationId,
    p_reason_code: "strongr_daily_v2_acceptance",
    p_review_policy_id: input.reviewPolicyId,
    p_rights_snapshot_id: input.rightsSnapshotId,
    p_scripture_evidence_id: input.scriptureEvidenceId,
    p_scripture_review_id: input.scriptureReviewId,
    p_theology_review_id: input.theologyReviewId,
  };
}

async function runAcceptance(config: AcceptanceConfig): Promise<void> {
  const fixture: Fixture = {
    membershipOne: randomUUID(),
    membershipTwo: randomUUID(),
    organizationOne: randomUUID(),
    organizationTwo: randomUUID(),
    roleOne: randomUUID(),
    roleTwo: randomUUID(),
    runId: randomUUID().replaceAll("-", ""),
    userOne: "" as Uuid,
    userTwo: "" as Uuid,
  };
  const createdUsers: Uuid[] = [];
  let databaseSeeded = false;

  try {
    const migrationCount = runPsql(
      config,
      "v2_forward_fix_migration_recorded_once",
      "migration_history_count",
      `
select count(*)
from supabase_migrations.schema_migrations
where version = '20260728100000';
`,
    );
    addEvidence("v2_forward_fix_migration_recorded_once", migrationCount === "1");

    const readyOutbox = runPsql(
      config,
      "v2_preflight_disposable_queue_is_clean",
      "generation_outbox_preflight",
      `
select count(*)
from public.outbox_events
where event_type = 'content.generation_requested.v1'
  and (
    (status in ('pending', 'failed') and available_at <= statement_timestamp())
    or (status = 'processing' and lease_expires_at <= statement_timestamp())
  );
`,
    );
    addEvidence("v2_preflight_disposable_queue_is_clean", readyOutbox === "0");

    const passwordOne = `${randomUUID()}aA1!`;
    const passwordTwo = `${randomUUID()}aA1!`;
    const emailOne = `sd-v2-${fixture.runId}-one@example.invalid`;
    const emailTwo = `sd-v2-${fixture.runId}-two@example.invalid`;
    fixture.userOne = await createUser(config, emailOne, passwordOne);
    createdUsers.push(fixture.userOne);
    fixture.userTwo = await createUser(config, emailTwo, passwordTwo);
    createdUsers.push(fixture.userTwo);
    seedDatabase(config, fixture);
    databaseSeeded = true;

    const tokenOneAal1 = await signIn(config, emailOne, passwordOne);
    const tokenTwoAal1 = await signIn(config, emailTwo, passwordTwo);
    addEvidence(
      "v2_real_auth_sessions_begin_at_aal1",
      jwtClaims(tokenOneAal1).aal === "aal1" && jwtClaims(tokenTwoAal1).aal === "aal1",
    );
    const tokenOneAal2 = await promoteToAal2(
      config,
      tokenOneAal1,
      `Strongr Daily v2 ${fixture.runId}`,
    );
    addEvidence("v2_real_mfa_session_is_aal2", jwtClaims(tokenOneAal2).aal === "aal2");

    const workerEnvironment = createWorkerEnvironment(config);
    const service = new SupabaseRpcClient(workerEnvironment);
    const reviewStore = new SupabaseReviewCheckStore(service);
    const definitions = checkDefinitions(
      await restRows(
        config,
        tokenOneAal2,
        "check_definitions",
        "select=id,key,version,name,lane,blocks_approval&order=key.asc",
      ),
    );
    const checkRunner = new AutomatedReviewCheckRunner({ store: reviewStore });

    const crossTenantRows = await restRows(
      config,
      tokenTwoAal1,
      "content_briefs",
      new URLSearchParams({
        organization_id: `eq.${fixture.organizationOne}`,
        select: "id",
      }).toString(),
    );
    addEvidence("v2_tenant_isolation_blocks_cross_tenant_reads", crossTenantRows.length === 0);

    const v2Brief = await createBrief(
      config,
      tokenOneAal1,
      fixture.organizationOne,
      strongrDailyAudioReflectionV2BriefFixture.working_title,
      strongrDailyAudioReflectionV2BriefFixture,
    );
    const storedBriefRows = await restRows(
      config,
      tokenOneAal1,
      "content_briefs",
      new URLSearchParams({
        id: `eq.${v2Brief.briefId}`,
        organization_id: `eq.${fixture.organizationOne}`,
        select: "id,schema_id,payload",
      }).toString(),
    );
    const storedBrief = requireRecord(storedBriefRows[0], "stored_v2_brief");
    addEvidence(
      "v2_brief_created_with_explicit_schema",
      storedBrief.schema_id === "strongr.strongr_daily_audio_reflection_brief.v2" &&
        deepEqualJson(storedBrief.payload, strongrDailyAudioReflectionV2BriefFixture),
    );

    const v2JobId = await requestGeneration(
      config,
      tokenOneAal1,
      fixture.organizationOne,
      v2Brief.briefId,
      fixture.runId,
      "valid",
    );
    addEvidence("v2_governed_generation_request_succeeds", Boolean(v2JobId));
    const v2Claim = await claimGeneration(service, config.workerId, v2JobId);
    const v2Begin = await beginGeneration(service, config.workerId, v2Claim);
    addEvidence(
      "v2_worker_receives_exact_source_brief",
      deepEqualJson(v2Begin.brief, strongrDailyAudioReflectionV2BriefFixture),
    );
    const v2Output = createStrongrDailyV2FixtureOutput(strongrDailyAudioReflectionV2BriefFixture);

    const unknownSchemaDenied = await stateDenied(() =>
      completeGeneration(
        service,
        config.workerId,
        v2Claim,
        v2Begin,
        "strongr.unknown.v9",
        { ...v2Output, schema_id: "strongr.unknown.v9" },
        "0".repeat(64),
        `unknown-${fixture.runId}`,
      ),
    );
    addEvidence("v2_unknown_response_schema_is_rejected", unknownSchemaDenied);
    const mismatchedSchemaDenied = await stateDenied(() =>
      completeGeneration(
        service,
        config.workerId,
        v2Claim,
        v2Begin,
        "strongr.audio_reflection.v1",
        { ...v2Output, schema_id: "strongr.audio_reflection.v1" },
        "0".repeat(64),
        `mismatch-${fixture.runId}`,
      ),
    );
    addEvidence("v2_response_schema_must_match_source_brief", mismatchedSchemaDenied);

    const v2VersionId = await completeGeneration(
      service,
      config.workerId,
      v2Claim,
      v2Begin,
      v2Output.schema_id,
      v2Output,
      createGenerationOutputHash(v2Output),
      `valid-${fixture.runId}`,
    );
    const v2Version = await loadVersion(config, tokenOneAal1, fixture.organizationOne, v2VersionId);
    const requiredV2Fields = [
      "app_description",
      "artwork_generation_prompt",
      "closing",
      "estimated_duration_seconds",
      "final_title",
      "keywords",
      "narration_text",
      "personal_takeaway_prompt",
      "prayer",
      "reflective_transition",
      "scripture_introduction",
      "scripture_reference",
      "short_summary",
      "social_caption",
      "warm_welcome",
    ];
    addEvidence(
      "v2_worker_completion_persists_complete_exact_payload",
      v2Version.schemaId === v2Output.schema_id &&
        deepEqualJson(v2Version.payload, v2Output) &&
        requiredV2Fields.every((field) => field in v2Version.payload),
      { required_field_count: requiredV2Fields.length },
    );
    await submitVersion(config, tokenOneAal1, fixture.organizationOne, v2VersionId);

    const validCheckRun = await checkRunner.run({
      checkDefinitions: definitions,
      contentVersionId: v2VersionId,
      correlationId: randomUUID(),
      organizationId: fixture.organizationOne,
      reflection: v2Version.payload,
    });
    addEvidence(
      "v2_deterministic_checks_run_and_pass",
      validCheckRun.results.length === definitions.length &&
        validCheckRun.results.every((result) => ["pass", "warn"].includes(result.outcome)),
      { check_count: validCheckRun.results.length },
    );

    const reviewPolicyId = requireUuid(
      await userRpc(config, tokenOneAal2, "m1_create_review_policy", {
        p_correlation_id: randomUUID(),
        p_key: `strongr_daily_v2_${fixture.runId}`,
        p_organization_id: fixture.organizationOne,
        p_version: 1,
      }),
      "review_policy_id",
    );
    const scriptureEvidenceId = await recordScriptureEvidence(
      config,
      tokenOneAal2,
      fixture.organizationOne,
      v2VersionId,
    );
    const rightsSnapshotId = await recordRights(
      config,
      tokenOneAal2,
      fixture.organizationOne,
      v2VersionId,
    );
    const scriptureReviewId = await recordReview(
      config,
      tokenOneAal2,
      fixture.organizationOne,
      v2VersionId,
      "scripture",
    );
    const theologyReviewId = await recordReview(
      config,
      tokenOneAal2,
      fixture.organizationOne,
      v2VersionId,
      "theology",
    );
    const incompleteReviewDenied = await stateDenied(() =>
      userRpc(
        config,
        tokenOneAal2,
        "m1_approve_version",
        approvalBody({
          checkRunId: validCheckRun.checkRunId,
          editorialReviewId: theologyReviewId,
          organizationId: fixture.organizationOne,
          reviewPolicyId,
          rightsSnapshotId,
          scriptureEvidenceId,
          scriptureReviewId,
          theologyReviewId,
          versionId: v2VersionId,
        }),
      ),
    );
    addEvidence("v2_incomplete_human_reviews_block_approval", incompleteReviewDenied);
    const editorialReviewId = await recordReview(
      config,
      tokenOneAal2,
      fixture.organizationOne,
      v2VersionId,
      "editorial",
    );
    const exactApproval = approvalBody({
      checkRunId: validCheckRun.checkRunId,
      editorialReviewId,
      organizationId: fixture.organizationOne,
      reviewPolicyId,
      rightsSnapshotId,
      scriptureEvidenceId,
      scriptureReviewId,
      theologyReviewId,
      versionId: v2VersionId,
    });
    const aal1Denied = await httpDenied(() =>
      userRpc(config, tokenOneAal1, "m1_approve_version", exactApproval),
    );
    addEvidence("v2_aal1_approval_is_denied", aal1Denied);
    const workerApprovalDenied = await stateDenied(() =>
      service.rpc("m1_approve_version", exactApproval),
    );
    addEvidence(
      "v2_ai_and_service_worker_cannot_approve",
      workerApprovalDenied &&
        runPsql(
          config,
          "v2_ai_and_service_worker_cannot_approve",
          "service_role_approval_execute_check",
          `
select has_function_privilege(
  'service_role',
  'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)',
  'EXECUTE'
)::text;
`,
        ) === "false",
    );

    const approvalSnapshotId = requireUuid(
      await userRpc(config, tokenOneAal2, "m1_approve_version", exactApproval),
      "approval_snapshot_id",
    );
    const approvalRows = await restRows(
      config,
      tokenOneAal2,
      "approval_snapshots",
      new URLSearchParams({
        id: `eq.${approvalSnapshotId}`,
        organization_id: `eq.${fixture.organizationOne}`,
        select:
          "id,content_version_id,version_payload_hash,authentication_assurance,approver_membership_id",
      }).toString(),
    );
    const approval = requireRecord(approvalRows[0], "approval_snapshot");
    addEvidence(
      "v2_aal2_approval_binds_exact_version_and_payload_hash",
      approval.content_version_id === v2VersionId &&
        approval.version_payload_hash === v2Version.payloadHash &&
        approval.authentication_assurance === "aal2" &&
        approval.approver_membership_id === fixture.membershipOne,
    );

    const packageId = requireUuid(
      await userRpc(config, tokenOneAal2, "m1_create_production_package", {
        p_approval_snapshot_id: approvalSnapshotId,
        p_correlation_id: randomUUID(),
        p_organization_id: fixture.organizationOne,
      }),
      "production_package_id",
    );
    const packageRows = await restRows(
      config,
      tokenOneAal2,
      "production_packages",
      new URLSearchParams({
        id: `eq.${packageId}`,
        organization_id: `eq.${fixture.organizationOne}`,
        select:
          "id,organization_id,approval_snapshot_id,manifest_schema_id,manifest,manifest_hash,created_at",
      }).toString(),
    );
    const packageRow = requireRecord(packageRows[0], "production_package");
    const manifest = requireRecord(packageRow.manifest, "production_package_manifest");
    addEvidence(
      "v2_package_is_exact_approved_immutable_version",
      packageRow.approval_snapshot_id === approvalSnapshotId &&
        manifest.content_version_id === v2VersionId &&
        manifest.content_payload_hash === v2Version.payloadHash &&
        deepEqualJson(manifest.content, v2Version.payload),
    );

    const directVersionMutationDenied = await httpDenied(() =>
      httpJson(
        config,
        "PATCH",
        `/rest/v1/content_versions?id=eq.${encodeURIComponent(v2VersionId)}`,
        {
          apiKey: config.publishableKey,
          bearer: tokenOneAal2,
          body: { payload: { ...v2Output, prayer: "Forbidden direct change." } },
        },
      ),
    );
    const workerVersionMutationDenied = await httpDenied(() =>
      httpJson(
        config,
        "PATCH",
        `/rest/v1/content_versions?id=eq.${encodeURIComponent(v2VersionId)}`,
        {
          apiKey: config.serviceRoleKey,
          body: { payload: { ...v2Output, prayer: "Forbidden worker change." } },
          service: true,
        },
      ),
    );
    addEvidence(
      "v2_approved_version_rejects_human_and_worker_mutation",
      directVersionMutationDenied && workerVersionMutationDenied,
    );
    const directPackageMutationDenied = await httpDenied(() =>
      httpJson(
        config,
        "PATCH",
        `/rest/v1/production_packages?id=eq.${encodeURIComponent(packageId)}`,
        {
          apiKey: config.publishableKey,
          bearer: tokenOneAal2,
          body: { manifest: { forbidden: true } },
        },
      ),
    );
    const workerPackageMutationDenied = await httpDenied(() =>
      httpJson(
        config,
        "PATCH",
        `/rest/v1/production_packages?id=eq.${encodeURIComponent(packageId)}`,
        {
          apiKey: config.serviceRoleKey,
          body: { manifest: { forbidden: true } },
          service: true,
        },
      ),
    );
    addEvidence(
      "v2_production_package_rejects_human_and_worker_mutation",
      directPackageMutationDenied && workerPackageMutationDenied,
    );

    const productionPackage: TenantProductionPackageSummary = Object.freeze({
      approvalSnapshotId,
      createdAt: requireString(packageRow, "created_at"),
      id: packageId,
      manifest: manifest as JsonObject,
      manifestHash: requireString(packageRow, "manifest_hash"),
      manifestSchemaId: "strongr.production_package.v1",
      organizationId: fixture.organizationOne,
    });
    const exportedAt = new Date().toISOString();
    const exported = createStrongrDailyApprovedExport({ exportedAt, productionPackage });
    const exportedJson = requireRecord(JSON.parse(exported.json), "json_export");
    const exportedContent = requireRecord(exportedJson.content, "json_export_content");
    const creativeFieldValues = [
      v2Output.app_description,
      v2Output.artwork_generation_prompt,
      v2Output.narration_text,
      v2Output.personal_takeaway_prompt,
      v2Output.prayer,
      v2Output.social_caption,
    ];
    addEvidence(
      "v2_json_export_is_exact_immutable_package_projection",
      exportedJson.publication_status === "manual_upload_required" &&
        deepEqualJson(exportedContent, manifest.content),
    );
    addEvidence(
      "v2_markdown_export_contains_only_approved_creative_values",
      creativeFieldValues.every((value) => exported.markdown.includes(value)) &&
        !exported.markdown.includes("Forbidden direct change") &&
        !exported.markdown.includes("Forbidden worker change"),
      { approved_creative_field_count: creativeFieldValues.length },
    );

    const mutatedOutputBase = {
      ...v2Output,
      artwork_generation_prompt: `${v2Output.artwork_generation_prompt} Changed fixture.`,
      narration_text: `${v2Output.narration_text} Changed fixture.`,
      prayer: `${v2Output.prayer} Changed fixture.`,
      social_caption: `${v2Output.social_caption} Changed fixture.`,
    };
    const mutatedOutput = {
      ...mutatedOutputBase,
      content_hash: createGenerationOutputHash({
        ...mutatedOutputBase,
        content_hash: "0".repeat(64),
      }),
    };
    const mutatedJobId = await requestGeneration(
      config,
      tokenOneAal1,
      fixture.organizationOne,
      v2Brief.briefId,
      fixture.runId,
      "mutated",
    );
    const mutatedClaim = await claimGeneration(service, config.workerId, mutatedJobId);
    const mutatedBegin = await beginGeneration(service, config.workerId, mutatedClaim);
    const mutatedVersionId = await completeGeneration(
      service,
      config.workerId,
      mutatedClaim,
      mutatedBegin,
      v2Output.schema_id,
      mutatedOutput,
      createGenerationOutputHash(mutatedOutput),
      `mutated-${fixture.runId}`,
    );
    const mutatedVersion = await loadVersion(
      config,
      tokenOneAal1,
      fixture.organizationOne,
      mutatedVersionId,
    );
    await submitVersion(config, tokenOneAal1, fixture.organizationOne, mutatedVersionId);
    const mutatedCheckRun = await checkRunner.run({
      checkDefinitions: definitions,
      contentVersionId: mutatedVersionId,
      correlationId: randomUUID(),
      organizationId: fixture.organizationOne,
      reflection: mutatedVersion.payload,
    });
    const mutatedScripture = await recordScriptureEvidence(
      config,
      tokenOneAal2,
      fixture.organizationOne,
      mutatedVersionId,
    );
    const mutatedRights = await recordRights(
      config,
      tokenOneAal2,
      fixture.organizationOne,
      mutatedVersionId,
    );
    const oldReviewsDenied = await stateDenied(() =>
      userRpc(
        config,
        tokenOneAal2,
        "m1_approve_version",
        approvalBody({
          checkRunId: mutatedCheckRun.checkRunId,
          editorialReviewId,
          organizationId: fixture.organizationOne,
          reviewPolicyId,
          rightsSnapshotId: mutatedRights,
          scriptureEvidenceId: mutatedScripture,
          scriptureReviewId,
          theologyReviewId,
          versionId: mutatedVersionId,
        }),
      ),
    );
    addEvidence(
      "v2_reviewed_field_changes_require_new_version_and_new_reviews",
      mutatedVersionId !== v2VersionId &&
        mutatedVersion.payloadHash !== v2Version.payloadHash &&
        oldReviewsDenied,
    );

    const incompleteOutput = { ...v2Output } as Record<string, unknown>;
    delete incompleteOutput.prayer;
    delete incompleteOutput.narration_text;
    incompleteOutput.content_hash = createGenerationOutputHash(incompleteOutput as typeof v2Output);
    const incompleteJobId = await requestGeneration(
      config,
      tokenOneAal1,
      fixture.organizationOne,
      v2Brief.briefId,
      fixture.runId,
      "incomplete",
    );
    const incompleteClaim = await claimGeneration(service, config.workerId, incompleteJobId);
    const incompleteBegin = await beginGeneration(service, config.workerId, incompleteClaim);
    const incompleteVersionId = await completeGeneration(
      service,
      config.workerId,
      incompleteClaim,
      incompleteBegin,
      v2Output.schema_id,
      incompleteOutput,
      createGenerationOutputHash(incompleteOutput as typeof v2Output),
      `incomplete-${fixture.runId}`,
    );
    await submitVersion(config, tokenOneAal1, fixture.organizationOne, incompleteVersionId);
    const incompleteRun = await checkRunner.run({
      checkDefinitions: definitions,
      contentVersionId: incompleteVersionId,
      correlationId: randomUUID(),
      organizationId: fixture.organizationOne,
      reflection: incompleteOutput,
    });
    addEvidence(
      "v2_missing_required_fields_fail_deterministic_checks",
      incompleteRun.results.some(
        (result) =>
          result.detailCode === "m1_3.required_structure_missing" && result.outcome === "fail",
      ) &&
        incompleteRun.results.some(
          (result) => result.detailCode === "m1_3.transcript_missing" && result.outcome === "fail",
        ),
    );

    const v1Brief = await createBrief(
      config,
      tokenOneAal1,
      fixture.organizationOne,
      audioReflectionBriefFixture.title,
      audioReflectionBriefFixture,
    );
    const v1JobId = await requestGeneration(
      config,
      tokenOneAal1,
      fixture.organizationOne,
      v1Brief.briefId,
      fixture.runId,
      "v1-smoke",
    );
    const v1Claim = await claimGeneration(service, config.workerId, v1JobId);
    const v1Begin = await beginGeneration(service, config.workerId, v1Claim);
    const v1Generation = await deterministicGenerationAdapter.generate({
      brief: audioReflectionBriefFixture,
      correlationId: randomUUID(),
      generationJobId: v1JobId,
      organizationId: fixture.organizationOne,
      promptKey: "strongr.audio_reflection.fixture",
      promptVersion: 1,
    });
    const v1VersionId = await completeGeneration(
      service,
      config.workerId,
      v1Claim,
      v1Begin,
      v1Generation.responseSchemaId,
      v1Generation.output,
      v1Generation.outputHash,
      `v1-${fixture.runId}`,
    );
    const v1Version = await loadVersion(config, tokenOneAal1, fixture.organizationOne, v1VersionId);
    addEvidence(
      "existing_v1_brief_to_draft_path_remains_passing",
      v1Version.schemaId === "strongr.audio_reflection.v1" &&
        deepEqualJson(v1Version.payload, v1Generation.output),
    );

    const crossTenantPackageRows = await restRows(
      config,
      tokenTwoAal1,
      "production_packages",
      new URLSearchParams({
        organization_id: `eq.${fixture.organizationOne}`,
        select: "id",
      }).toString(),
    );
    const crossTenantCommandDenied = await httpDenied(() =>
      userRpc(config, tokenTwoAal1, "m1_create_audio_brief", {
        p_correlation_id: randomUUID(),
        p_organization_id: fixture.organizationOne,
        p_payload: strongrDailyAudioReflectionV2BriefFixture,
        p_title: "Cross-tenant command must fail",
      }),
    );
    addEvidence(
      "v2_tenant_isolation_remains_enforced_end_to_end",
      crossTenantPackageRows.length === 0 && crossTenantCommandDenied,
    );

    const publishFunctionCount = runPsql(
      config,
      "v2_no_publishing_route_exists_or_is_called",
      "publishing_function_inventory",
      `
select count(*)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'm1_publish%';
`,
    );
    addEvidence(
      "v2_no_publishing_route_exists_or_is_called",
      publishFunctionCount === "0" && exportedJson.publication_status === "manual_upload_required",
    );

    await userRpc(config, tokenOneAal2, "m1_revoke_approval", {
      p_approval_snapshot_id: approvalSnapshotId,
      p_correlation_id: randomUUID(),
      p_organization_id: fixture.organizationOne,
      p_reason_code: "strongr_daily_v2_revocation_proof",
    });
    const revokedPackageDenied = await stateDenied(() =>
      userRpc(config, tokenOneAal2, "m1_create_production_package", {
        p_approval_snapshot_id: approvalSnapshotId,
        p_correlation_id: randomUUID(),
        p_organization_id: fixture.organizationOne,
      }),
    );
    addEvidence("v2_revocation_blocks_new_package_generation", revokedPackageDenied);

    const serializedEvidence = JSON.stringify(evidence);
    addEvidence(
      "v2_evidence_is_redacted",
      !/(?:access_token|apikey|authorization|database_url|sb_secret_|eyJ[a-zA-Z0-9_-]{20,}\.)/i.test(
        serializedEvidence,
      ),
    );
  } finally {
    let databaseCleanupPassed = !databaseSeeded;
    if (databaseSeeded) {
      try {
        cleanupDatabase(config, fixture);
        databaseCleanupPassed = true;
      } catch (error) {
        databaseCleanupPassed = false;
        if (error instanceof DatabaseCommandFailure) {
          evidence.push(databaseFailureEvidence("v2_fixture_database_cleanup", error));
        }
      }
    }
    if (databaseCleanupPassed) {
      evidence.push({ status: "pass", test: "v2_fixture_database_cleanup" });
    } else if (!evidence.some((record) => record.test === "v2_fixture_database_cleanup")) {
      evidence.push({ status: "fail", test: "v2_fixture_database_cleanup" });
    }

    let authCleanupPassed = true;
    for (const userId of createdUsers.reverse()) {
      try {
        await deleteUser(config, userId);
      } catch {
        authCleanupPassed = false;
      }
    }
    evidence.push({
      status: authCleanupPassed ? "pass" : "fail",
      test: "v2_fixture_auth_cleanup",
    });
  }
}

function writeArtifact(artifactPath: string, target: string, fatalCode: string | null): void {
  const failures = evidence.filter((record) => record.status !== "pass");
  const artifact = {
    evidence,
    failed: failures.length,
    finished_at: new Date().toISOString(),
    started_at: runStartedAt,
    status: failures.length === 0 && fatalCode === null ? "pass" : "fail",
    target,
    test: "strongr_daily_v2_supabase_acceptance",
  };
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: "utf8",
  });
  for (const record of evidence) process.stdout.write(`${JSON.stringify(record)}\n`);
  process.stdout.write(
    `${JSON.stringify({
      artifact: artifactPath,
      failed: artifact.failed,
      passed: evidence.length - failures.length,
      status: artifact.status,
      target,
      test: "strongr_daily_v2_supabase_acceptance_summary",
    })}\n`,
  );
  process.exitCode = artifact.status === "pass" ? 0 : 1;
}

function databaseFailureEvidence(
  test: string,
  error: DatabaseCommandFailure,
): EvidenceRecord {
  return {
    database_command: error.diagnostic.command,
    database_detail: error.diagnostic.detail,
    database_hint: error.diagnostic.hint,
    database_message: error.diagnostic.message,
    error_code: error.code,
    lifecycle_step: error.diagnostic.lifecycleStep,
    postgres_code: error.diagnostic.postgresCode,
    status: "fail",
    test,
  };
}

async function main(): Promise<void> {
  let artifactPath = resolve("artifacts/acceptance/strongr-daily-v2.json");
  let fatalCode: string | null = null;
  let target = "unknown";
  try {
    const config = loadConfig();
    artifactPath = config.artifactPath;
    target = config.target;
    await runAcceptance(config);
  } catch (error) {
    fatalCode =
      error instanceof AcceptanceFailure
        ? error.code
        : error instanceof AcceptanceHttpFailure
          ? `http_${error.status}`
          : error instanceof SupabaseRpcError
            ? `rpc_${error.rpcName}_${error.databaseCode ?? error.status}`
            : "unexpected_acceptance_failure";
    evidence.push(
      error instanceof DatabaseCommandFailure
        ? databaseFailureEvidence("strongr_daily_v2_supabase_acceptance", error)
        : {
            error_code: fatalCode,
            status: "fail",
            test: "strongr_daily_v2_supabase_acceptance",
          },
    );
  }
  writeArtifact(artifactPath, target, fatalCode);
}

await main();
