#!/usr/bin/env -S node --experimental-strip-types

import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { SupabaseRpcError } from "../../apps/worker/src/index.ts";
import type { Uuid } from "../../packages/contracts/src/index.ts";
import {
  audioReflectionBriefFixture,
  strongrDailyAudioReflectionV2BriefFixture,
} from "../../packages/testing/src/index.ts";
import {
  type DatabaseCommandDiagnostic,
  databaseCommandDiagnostic,
} from "./database-command-diagnostics.ts";

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

async function databaseCodeDenied(
  action: () => Promise<unknown>,
  expectedCode: string,
): Promise<boolean> {
  try {
    await action();
  } catch (error) {
    return (
      (error instanceof AcceptanceHttpFailure && error.databaseCode === expectedCode) ||
      (error instanceof SupabaseRpcError && error.databaseCode === expectedCode)
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
        (["22023", "23503", "42501", "55000"].includes(error.databaseCode ?? "") ||
          [401, 403, 404].includes(error.status))) ||
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
    [config.databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
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
        exitStatus: completed.status,
        lifecycleStep,
        processErrorCode: processErrorCode(completed.error),
        stderr: `${completed.stderr ?? ""}\n${completed.stdout ?? ""}`,
      }),
    );
  }
  return completed.stdout.trim();
}

function processErrorCode(error: Error | undefined): string | null {
  if (!error || !("code" in error) || typeof error.code !== "string") return null;
  return error.code;
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

    const profileCount = runPsql(
      config,
      "v2_content_profile_registry_is_empty",
      "content_profile_registry_count",
      "select count(*) from app_private.strongr_daily_content_profiles;",
    );
    const activeProfileCount = runPsql(
      config,
      "v2_no_content_profile_is_active",
      "active_content_profile_count",
      `
select count(*)
from app_private.strongr_daily_content_profiles
where lifecycle_state = 'active';
`,
    );
    addEvidence("v2_content_profile_registry_is_empty", profileCount === "0", {
      content_profile_count: Number(profileCount),
    });
    addEvidence("v2_no_content_profile_is_active", activeProfileCount === "0", {
      active_profile_count: Number(activeProfileCount),
    });

    const v2BriefWithoutProfile: UnknownRecord = Object.fromEntries(
      Object.entries(strongrDailyAudioReflectionV2BriefFixture).filter(
        ([key]) => key !== "content_profile",
      ),
    );
    const v2BriefWithoutProfileDenied = await databaseCodeDenied(
      () =>
        createBrief(
          config,
          tokenOneAal1,
          fixture.organizationOne,
          strongrDailyAudioReflectionV2BriefFixture.working_title,
          v2BriefWithoutProfile,
        ),
      "22023",
    );
    addEvidence("v2_brief_requires_exact_registered_content_profile", v2BriefWithoutProfileDenied);

    const legacyBrief = await createBrief(
      config,
      tokenOneAal1,
      fixture.organizationOne,
      audioReflectionBriefFixture.title,
      audioReflectionBriefFixture,
    );
    const liveProviderRequestDenied = await databaseCodeDenied(
      () =>
        userRpc(config, tokenOneAal1, "m1_request_generation", {
          p_brief_id: legacyBrief.briefId,
          p_correlation_id: randomUUID(),
          p_idempotency_key: `sd-v2-${fixture.runId}-no-active-profile`,
          p_organization_id: fixture.organizationOne,
          p_prompt_key: "strongr.strongr_daily.v2",
          p_prompt_version: 1,
        }),
      "55000",
    );
    addEvidence("v2_live_provider_request_requires_active_profile", liveProviderRequestDenied, {
      active_profile_count: Number(activeProfileCount),
    });

    const providerWorkCount = runPsql(
      config,
      "v2_profile_gate_prevents_provider_calls",
      "provider_work_count",
      `
select count(*)
from public.generation_jobs
where organization_id = '${fixture.organizationOne}'
  and brief_id = '${legacyBrief.briefId}';
`,
    );
    addEvidence("v2_profile_gate_prevents_provider_calls", providerWorkCount === "0", {
      generation_job_count: Number(providerWorkCount),
      provider_call_count: 0,
    });

    const immutablePackageId = randomUUID();
    runPsql(
      config,
      "v2_production_package_fixture_created_for_mutation_denial",
      "production_package_immutability_fixture",
      `
begin;
set local session_replication_role = replica;
insert into public.production_packages (
  id, organization_id, approval_snapshot_id, manifest, manifest_hash,
  created_by_membership_id
) values (
  '${immutablePackageId}', '${fixture.organizationOne}', '${randomUUID()}',
  '{"schema_id":"strongr.production_package.v1","acceptance_fixture":true}'::jsonb,
  repeat('a', 64), '${fixture.membershipOne}'
);
commit;
`,
    );
    const directPackageMutationDenied = await stateDenied(() =>
      httpJson(
        config,
        "PATCH",
        `/rest/v1/production_packages?id=eq.${encodeURIComponent(immutablePackageId)}`,
        {
          apiKey: config.publishableKey,
          bearer: tokenOneAal2,
          body: { manifest: { forbidden: true } },
        },
      ),
    );
    const workerPackageMutationDenied = await stateDenied(() =>
      httpJson(
        config,
        "PATCH",
        `/rest/v1/production_packages?id=eq.${encodeURIComponent(immutablePackageId)}`,
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

    const serializedFailClosedEvidence = JSON.stringify(evidence);
    addEvidence(
      "v2_evidence_is_redacted",
      !/(?:access_token|apikey|authorization|database_url|sb_secret_|eyJ[a-zA-Z0-9_-]{20,}\.)/i.test(
        serializedFailClosedEvidence,
      ),
    );

    addEvidence("v2_phase4b1_fail_closed_acceptance_complete", true, {
      active_profile_count: Number(activeProfileCount),
      provider_call_count: 0,
    });
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

function databaseFailureEvidence(test: string, error: DatabaseCommandFailure): EvidenceRecord {
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
