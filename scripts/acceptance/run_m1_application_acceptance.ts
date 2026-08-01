#!/usr/bin/env -S node --experimental-strip-types

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { deterministicGenerationAdapter } from "../../packages/ai/src/index.ts";
import { parseAudioReflection } from "../../packages/content-schemas/src/index.ts";
import type {
  TenantMediaArtifactSummary,
  TenantStagedReleaseBundleSummary,
  Uuid,
} from "../../packages/contracts/src/index.ts";
import { audioReflectionBriefFixture } from "../../packages/testing/src/index.ts";
import {
  createBriefToDraftOperatorFlow,
  createReviewToPackageOperatorFlow,
  createStudioSupabaseGateway,
  loadStudioEnvironment,
  StudioApiError,
  type StudioEnvironment,
} from "../../apps/studio/src/index.ts";
import {
  AutomatedReviewCheckRunner,
  createDurableMediaWorkerRuntime,
  createDurableWorkerRuntime,
  loadWorkerEnvironment,
  SupabasePrivateMediaStorage,
  SupabaseReviewCheckStore,
  SupabaseRpcClient,
  type AutomatedReviewCheckEvidence,
  type MediaWorkerEvidenceRecord,
  type WorkerEnvironment,
  type WorkerEvidenceRecord,
} from "../../apps/worker/src/index.ts";

type AcceptanceTarget = "local" | "strongr-os-dev";
type EvidenceStatus = "pass" | "fail";

interface EvidenceRecord {
  readonly test: string;
  readonly status: EvidenceStatus;
  readonly [name: string]: boolean | number | string | null;
}

interface AcceptanceConfig {
  readonly target: AcceptanceTarget;
  readonly projectRef: string;
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly serviceRoleKey: string;
  readonly databaseUrl: string;
  readonly workerId: string;
  readonly m2ArtifactDirectory: string | null;
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
  readonly status: number;
  readonly databaseCode: string | null;

  constructor(status: number, databaseCode: string | null) {
    super(`HTTP ${status}`);
    this.name = "AcceptanceHttpFailure";
    this.status = status;
    this.databaseCode = databaseCode;
  }
}

const evidence: EvidenceRecord[] = [];
const workerEvidence: WorkerEvidenceRecord[] = [];
const mediaWorkerEvidence: MediaWorkerEvidenceRecord[] = [];
const checkEvidence: AutomatedReviewCheckEvidence[] = [];

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AcceptanceFailure(`missing_${name.toLowerCase()}`);
  }
  return value;
}

function databaseMatchesProject(databaseUrl: string, projectRef: string): boolean {
  const parsed = new URL(databaseUrl);
  const hostname = parsed.hostname.toLowerCase();
  const username = decodeURIComponent(parsed.username);
  return hostname === `db.${projectRef}.supabase.co` || username.endsWith(`.${projectRef}`);
}

function loadAcceptanceConfig(): AcceptanceConfig {
  const target = requireEnvironment("STRONGR_OS_M1_ACCEPTANCE_TARGET");
  if (target !== "local" && target !== "strongr-os-dev") {
    throw new AcceptanceFailure("invalid_acceptance_target");
  }

  const projectRef = requireEnvironment("STRONGR_OS_PROJECT_REF");
  const supabaseUrl = requireEnvironment("STRONGR_OS_SUPABASE_URL").replace(/\/$/, "");
  const publishableKey = requireEnvironment("STRONGR_OS_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = requireEnvironment("STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY");
  const databaseUrl = requireEnvironment("STRONGR_OS_DATABASE_URL");
  const workerId = `m1-acceptance-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const m2ArtifactDirectory = process.env.STRONGR_OS_M2_ARTIFACT_DIR?.trim() || null;

  if (target === "strongr-os-dev") {
    if (!/^[a-z0-9]{20}$/.test(projectRef)) {
      throw new AcceptanceFailure("invalid_project_ref");
    }
    const apiHostname = new URL(supabaseUrl).hostname.toLowerCase();
    if (
      new URL(supabaseUrl).protocol !== "https:" ||
      apiHostname !== `${projectRef}.supabase.co` ||
      !databaseMatchesProject(databaseUrl, projectRef)
    ) {
      throw new AcceptanceFailure("remote_project_mismatch");
    }
    if (!publishableKey.startsWith("sb_publishable_")) {
      throw new AcceptanceFailure("remote_publishable_key_required");
    }
  } else {
    const api = new URL(supabaseUrl);
    const database = new URL(databaseUrl);
    if (
      projectRef !== "local" ||
      api.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(api.hostname) ||
      !["127.0.0.1", "localhost"].includes(database.hostname)
    ) {
      throw new AcceptanceFailure("local_target_mismatch");
    }
  }

  if (serviceRoleKey.length < 32 || publishableKey === serviceRoleKey) {
    throw new AcceptanceFailure("invalid_api_key_configuration");
  }

  return Object.freeze({
    databaseUrl,
    m2ArtifactDirectory,
    projectRef,
    publishableKey,
    serviceRoleKey,
    supabaseUrl,
    target,
    workerId,
  });
}

function addEvidence(
  test: string,
  condition: boolean,
  details: Omit<EvidenceRecord, "status" | "test"> = {},
): void {
  evidence.push({
    ...details,
    status: condition ? "pass" : "fail",
    test,
  });
  if (!condition) {
    throw new AcceptanceFailure(test);
  }
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

async function httpJson(
  config: AcceptanceConfig,
  method: string,
  path: string,
  input: {
    readonly apiKey: string;
    readonly bearer: string;
    readonly body?: unknown;
  },
): Promise<unknown> {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    headers: {
      Accept: "application/json",
      apikey: input.apiKey,
      Authorization: `Bearer ${input.bearer}`,
      ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
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

function requireRecord(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AcceptanceFailure(`invalid_${name}`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireString(record: Readonly<Record<string, unknown>>, key: string): string {
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

function runPsql(config: AcceptanceConfig, sql: string): string {
  const completed = spawnSync("psql", [config.databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    encoding: "utf8",
    input: sql,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (completed.status !== 0) {
    throw new AcceptanceFailure("database_command_failed");
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
      bearer: config.serviceRoleKey,
      body: {
        email,
        email_confirm: true,
        password,
        user_metadata: { purpose: "strongr-os-m1-acceptance" },
      },
    }),
    "admin_user",
  );
  return requireUuid(payload.id, "user_id");
}

async function deleteUser(config: AcceptanceConfig, userId: Uuid): Promise<void> {
  try {
    await httpJson(config, "DELETE", `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      apiKey: config.serviceRoleKey,
      bearer: config.serviceRoleKey,
    });
  } catch (error) {
    if (!(error instanceof AcceptanceHttpFailure) || error.status !== 404) {
      throw error;
    }
  }
}

async function signIn(config: AcceptanceConfig, email: string, password: string): Promise<string> {
  const payload = requireRecord(
    await httpJson(config, "POST", "/auth/v1/token?grant_type=password", {
      apiKey: config.publishableKey,
      bearer: config.publishableKey,
      body: { email, password },
    }),
    "sign_in",
  );
  return requireString(payload, "access_token");
}

function jwtClaims(token: string): Readonly<Record<string, unknown>> {
  const encoded = token.split(".")[1];
  if (!encoded) {
    throw new AcceptanceFailure("invalid_access_token");
  }
  return requireRecord(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")), "jwt");
}

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.replaceAll(" ", "").replaceAll("=", "").toUpperCase();
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) {
      throw new AcceptanceFailure("invalid_totp_secret");
    }
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
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
  const totp = requireRecord(enrollment.totp, "totp");
  const secret = requireString(totp, "secret");

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
  if (remainingMilliseconds <= 3_000) {
    await delay(remainingMilliseconds + 250);
  }

  const verified = requireRecord(
    await httpJson(config, "POST", `/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, {
      apiKey: config.publishableKey,
      bearer: accessToken,
      body: {
        challenge_id: challengeId,
        code: generateTotp(secret),
      },
    }),
    "factor_verification",
  );
  return requireString(verified, "access_token");
}

function createStudioEnvironment(config: AcceptanceConfig): StudioEnvironment {
  if (config.target === "strongr-os-dev") {
    return loadStudioEnvironment({
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
      PUBLIC_SUPABASE_URL: config.supabaseUrl,
    });
  }
  return Object.freeze({
    supabasePublishableKey: config.publishableKey,
    supabaseUrl: config.supabaseUrl,
  });
}

function createWorkerEnvironment(config: AcceptanceConfig): WorkerEnvironment {
  if (config.target === "strongr-os-dev") {
    return loadWorkerEnvironment({
      STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
      STRONGR_OS_SUPABASE_URL: config.supabaseUrl,
      STRONGR_OS_WORKER_ID: config.workerId,
    });
  }
  return Object.freeze({
    privilegedKeyKind: "legacy_service_role",
    supabasePrivilegedKey: config.serviceRoleKey,
    supabaseUrl: config.supabaseUrl,
    workerId: config.workerId,
  });
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function ensurePrivateMediaBucket(config: AcceptanceConfig): Promise<void> {
  const headers = {
    "Content-Type": "application/json",
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };
  let response = await fetch(`${config.supabaseUrl}/storage/v1/bucket/strongr-os-media`, {
    headers,
    method: "GET",
  });
  // Hosted Storage returns 400 for a missing bucket while the local emulator
  // returns 404. Both mean the disposable target still needs this reviewed,
  // private bucket; every other read failure remains fatal.
  if (response.status === 400 || response.status === 404) {
    response = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
      body: JSON.stringify({
        allowed_mime_types: ["audio/wav"],
        file_size_limit: 26_214_400,
        id: "strongr-os-media",
        name: "strongr-os-media",
        public: false,
      }),
      headers,
      method: "POST",
    });
    if (!response.ok) {
      throw new AcceptanceFailure("m2_private_bucket_creation_failed");
    }
    response = await fetch(`${config.supabaseUrl}/storage/v1/bucket/strongr-os-media`, {
      headers,
      method: "GET",
    });
  }
  if (!response.ok) {
    throw new AcceptanceFailure("m2_private_bucket_read_failed");
  }
  const bucket = requireRecord(await response.json(), "m2_private_bucket");
  const allowedMimeTypes = bucket.allowed_mime_types;
  if (
    bucket.public !== false ||
    Number(bucket.file_size_limit) !== 26_214_400 ||
    !Array.isArray(allowedMimeTypes) ||
    allowedMimeTypes.length !== 1 ||
    allowedMimeTypes[0] !== "audio/wav"
  ) {
    throw new AcceptanceFailure("m2_private_bucket_configuration_mismatch");
  }
}

async function deleteStorageObject(
  config: AcceptanceConfig,
  bucketId: string,
  objectPath: string,
): Promise<void> {
  const response = await fetch(
    `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucketId)}/${objectPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      method: "DELETE",
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new AcceptanceFailure("m2_storage_cleanup_failed");
  }
}

function writeEncryptedMediaBackup(
  config: AcceptanceConfig,
  artifact: TenantMediaArtifactSummary,
  bundle: TenantStagedReleaseBundleSummary,
  bytes: Uint8Array,
): Uint8Array {
  if (!config.m2ArtifactDirectory) {
    throw new AcceptanceFailure("missing_strongr_os_m2_artifact_dir");
  }
  mkdirSync(config.m2ArtifactDirectory, { recursive: true });
  const inventory = {
    artifact: {
      bucket_id: artifact.bucketId,
      byte_count: artifact.byteCount,
      id: artifact.id,
      mime_type: artifact.mimeType,
      object_path: artifact.objectPath,
      organization_id: artifact.organizationId,
      production_package_id: artifact.productionPackageId,
      sha256: artifact.sha256,
      validation_schema_id: artifact.validationSchemaId,
    },
    backup_schema_id: "strongr.m2_media_backup.v1",
    staged_release: {
      id: bundle.id,
      manifest_hash: bundle.manifestHash,
      manifest_schema_id: bundle.manifestSchemaId,
    },
  };
  const inventoryBytes = Buffer.from(JSON.stringify(inventory, null, 2), "utf8");
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(inventoryBytes);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encrypted = Buffer.concat([Buffer.from("SROSM2V1", "ascii"), iv, tag, ciphertext]);

  writeFileSync(`${config.m2ArtifactDirectory}/media-inventory.json`, inventoryBytes, {
    mode: 0o600,
  });
  writeFileSync(`${config.m2ArtifactDirectory}/media-backup.aes256gcm`, encrypted, {
    mode: 0o600,
  });
  writeFileSync(
    `${config.m2ArtifactDirectory}/media-backup-checksums.json`,
    `${JSON.stringify(
      {
        backup_schema_id: "strongr.m2_media_backup.v1",
        ciphertext_sha256: sha256(encrypted),
        encryption: "AES-256-GCM",
        inventory_sha256: sha256(inventoryBytes),
        plaintext_byte_count: bytes.byteLength,
        plaintext_sha256: artifact.sha256,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(inventoryBytes);
  decipher.setAuthTag(tag);
  const restored = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  key.fill(0);
  if (restored.byteLength !== artifact.byteCount || sha256(restored) !== artifact.sha256) {
    throw new AcceptanceFailure("m2_encrypted_backup_restore_mismatch");
  }
  return new Uint8Array(restored);
}

async function studioDenies(
  action: () => Promise<unknown>,
  expectedCodes: readonly string[] = ["42501"],
): Promise<boolean> {
  try {
    await action();
  } catch (error) {
    return error instanceof StudioApiError && expectedCodes.includes(error.code);
  }
  return false;
}

async function httpDenies(action: () => Promise<unknown>): Promise<boolean> {
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

function seedDatabase(
  config: AcceptanceConfig,
  fixture: {
    readonly organizationOne: Uuid;
    readonly organizationTwo: Uuid;
    readonly membershipOne: Uuid;
    readonly membershipTwo: Uuid;
    readonly roleOne: Uuid;
    readonly roleTwo: Uuid;
    readonly userOne: Uuid;
    readonly userTwo: Uuid;
    readonly runId: string;
  },
): void {
  runPsql(
    config,
    `
begin;
insert into public.organizations (id, name, slug)
values
  ('${fixture.organizationOne}', 'M1 acceptance tenant one', 'm1-${fixture.runId}-one'),
  ('${fixture.organizationTwo}', 'M1 acceptance tenant two', 'm1-${fixture.runId}-two');

insert into public.profiles (id, display_name)
values
  ('${fixture.userOne}', 'M1 acceptance operator one'),
  ('${fixture.userTwo}', 'M1 acceptance operator two');

insert into public.memberships (id, organization_id, profile_id)
values
  ('${fixture.membershipOne}', '${fixture.organizationOne}', '${fixture.userOne}'),
  ('${fixture.membershipTwo}', '${fixture.organizationTwo}', '${fixture.userTwo}');

insert into public.roles (id, organization_id, key, name)
values
  ('${fixture.roleOne}', '${fixture.organizationOne}', 'owner', 'Owner'),
  ('${fixture.roleTwo}', '${fixture.organizationTwo}', 'owner', 'Owner');

insert into public.membership_role_grants (
  organization_id, membership_id, role_id, granted_by_membership_id
)
values
  (
    '${fixture.organizationOne}',
    '${fixture.membershipOne}',
    '${fixture.roleOne}',
    '${fixture.membershipOne}'
  ),
  (
    '${fixture.organizationTwo}',
    '${fixture.membershipTwo}',
    '${fixture.roleTwo}',
    '${fixture.membershipTwo}'
  );

insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select seed.organization_id, seed.role_id, permission.id, seed.membership_id
from (
  values
    (
      '${fixture.organizationOne}'::uuid,
      '${fixture.roleOne}'::uuid,
      '${fixture.membershipOne}'::uuid
    ),
    (
      '${fixture.organizationTwo}'::uuid,
      '${fixture.roleTwo}'::uuid,
      '${fixture.membershipTwo}'::uuid
    )
) seed(organization_id, role_id, membership_id)
cross join public.permissions as permission;
commit;
`,
  );
}

function cleanupDatabase(
  config: AcceptanceConfig,
  organizationIds: readonly Uuid[],
  profileIds: readonly Uuid[],
): void {
  const organizations = organizationIds.join(",");
  const profileList = profileIds.map((id) => `'${id}'::uuid`).join(",");
  runPsql(
    config,
    `
select set_config('m1_acceptance.org_ids', '${organizations}', false);
set session_replication_role = replica;
delete from app_private.m1_generation_attempt_claims
where organization_id = any(
  string_to_array(current_setting('m1_acceptance.org_ids'), ',')::uuid[]
);
do $cleanup$
declare
  v_table record;
  v_organization_id uuid;
begin
  foreach v_organization_id in array string_to_array(
    current_setting('m1_acceptance.org_ids'), ','
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
delete from public.worker_heartbeats
where worker_id = '${config.workerId}';
delete from public.profiles where id in (${profileList});
set session_replication_role = origin;
`,
  );
}

function parseHealth(config: AcceptanceConfig): Readonly<Record<string, unknown>> {
  const raw = runPsql(config, "select public.m0_operational_health()::text;");
  return requireRecord(JSON.parse(raw), "operational_health");
}

async function runAcceptance(config: AcceptanceConfig): Promise<void> {
  const runId = randomUUID().replaceAll("-", "");
  const fixture = {
    membershipOne: randomUUID(),
    membershipTwo: randomUUID(),
    organizationOne: randomUUID(),
    organizationTwo: randomUUID(),
    roleOne: randomUUID(),
    roleTwo: randomUUID(),
    runId,
    userOne: "" as Uuid,
    userTwo: "" as Uuid,
  };
  const createdUsers: Uuid[] = [];
  let databaseSeeded = false;
  let mediaObjectPath: string | null = null;
  let orphanObjectPath: string | null = null;

  try {
    const readyOutboxEvents = Number.parseInt(
      runPsql(
        config,
        `
select count(*)
from public.outbox_events
where (
  status in ('pending', 'failed')
  and available_at <= statement_timestamp()
) or (
  status = 'processing'
  and lease_expires_at <= statement_timestamp()
);
`,
      ),
      10,
    );
    addEvidence("m1_remote_preflight_isolated_outbox", readyOutboxEvents === 0, {
      ready_events: readyOutboxEvents,
      target: config.target,
    });

    const passwordOne = `${randomUUID()}aA1!`;
    const passwordTwo = `${randomUUID()}aA1!`;
    const emailOne = `m1-${runId}-one@example.invalid`;
    const emailTwo = `m1-${runId}-two@example.invalid`;
    fixture.userOne = await createUser(config, emailOne, passwordOne);
    createdUsers.push(fixture.userOne);
    fixture.userTwo = await createUser(config, emailTwo, passwordTwo);
    createdUsers.push(fixture.userTwo);
    seedDatabase(config, fixture);
    databaseSeeded = true;

    const tokenOneAal1 = await signIn(config, emailOne, passwordOne);
    const tokenTwoAal1 = await signIn(config, emailTwo, passwordTwo);
    addEvidence(
      "m1_real_auth_sessions_are_aal1",
      jwtClaims(tokenOneAal1).aal === "aal1" && jwtClaims(tokenTwoAal1).aal === "aal1",
    );
    const tokenOneAal2 = await promoteToAal2(config, tokenOneAal1, `M1 ${runId}`);
    addEvidence("m1_real_mfa_session_is_aal2", jwtClaims(tokenOneAal2).aal === "aal2");

    const studioEnvironment = createStudioEnvironment(config);
    const workerEnvironment = createWorkerEnvironment(config);
    const gatewayOneAal1 = createStudioSupabaseGateway({
      accessToken: tokenOneAal1,
      environment: studioEnvironment,
    });
    const gatewayOneAal2 = createStudioSupabaseGateway({
      accessToken: tokenOneAal2,
      environment: studioEnvironment,
    });
    const gatewayTwoAal1 = createStudioSupabaseGateway({
      accessToken: tokenTwoAal1,
      environment: studioEnvironment,
    });
    const briefFlowAal1 = createBriefToDraftOperatorFlow({
      commands: gatewayOneAal1,
      generation: {
        async startGeneration({ generationJobId }) {
          return {
            contentVersionId: null,
            errorCode: null,
            estimatedCostMicrounits: null,
            generationJobId,
            inputTokens: null,
            outputTokens: null,
            state: "queued",
          };
        },
      },
      reads: gatewayOneAal1,
    });
    const reviewFlowAal1 = createReviewToPackageOperatorFlow({
      commands: gatewayOneAal1,
      reads: gatewayOneAal1,
    });
    const reviewFlowAal2 = createReviewToPackageOperatorFlow({
      commands: gatewayOneAal2,
      reads: gatewayOneAal2,
    });

    const crossTenantBriefs = await gatewayTwoAal1.listBriefs(fixture.organizationOne);
    addEvidence("m1_two_tenant_read_isolation", crossTenantBriefs.length === 0);

    const anonymousDenied = await httpDenies(() =>
      httpJson(config, "POST", "/rest/v1/rpc/m1_create_audio_brief", {
        apiKey: config.publishableKey,
        bearer: config.publishableKey,
        body: {
          p_correlation_id: randomUUID(),
          p_organization_id: fixture.organizationOne,
          p_payload: audioReflectionBriefFixture,
          p_title: "Anonymous request must fail",
        },
      }),
    );
    addEvidence("m1_anonymous_governed_command_denied", anonymousDenied);

    const directWriteDenied = await httpDenies(() =>
      httpJson(config, "POST", "/rest/v1/content_versions", {
        apiKey: config.publishableKey,
        bearer: tokenOneAal1,
        body: {
          organization_id: fixture.organizationOne,
          payload: { forbidden: true },
        },
      }),
    );
    addEvidence("m1_browser_direct_write_denied", directWriteDenied);

    const briefResult = await briefFlowAal1.createBriefAndRequestGeneration({
      brief: audioReflectionBriefFixture,
      correlationId: randomUUID(),
      idempotencyKey: `m1-acceptance-${runId}`,
      organizationId: fixture.organizationOne,
      promptKey: "strongr.audio_reflection.fixture",
      promptVersion: 1,
      title: audioReflectionBriefFixture.title,
    });
    addEvidence(
      "m1_operator_brief_and_durable_request",
      Boolean(briefResult.briefId && briefResult.contentItemId && briefResult.generationJobId),
    );

    const retryingRuntime = createDurableWorkerRuntime(workerEnvironment, {
      adapter: {
        generate() {
          return Promise.reject(new Error("synthetic transient failure"));
        },
        identity: deterministicGenerationAdapter.identity,
      },
      evidence: {
        record(record) {
          workerEvidence.push(record);
        },
      },
    });
    const retrySummary = await retryingRuntime.runOnce({
      batchSize: 1,
      retryAfterSeconds: 0,
    });
    addEvidence(
      "m1_worker_transient_failure_recorded",
      retrySummary.retried === 1 && retrySummary.deadLettered === 0,
    );

    const recoveredRuntime = createDurableWorkerRuntime(workerEnvironment, {
      evidence: {
        record(record) {
          workerEvidence.push(record);
        },
      },
    });
    const recoveredSummary = await recoveredRuntime.runOnce({
      batchSize: 1,
      retryAfterSeconds: 0,
    });
    addEvidence(
      "m1_worker_retry_recovered",
      recoveredSummary.succeeded === 1 && recoveredSummary.retried === 0,
    );

    const draftWorkspace = await briefFlowAal1.loadWorkspace(fixture.organizationOne);
    const generationJob = draftWorkspace.generationJobs.find(
      (job) => job.id === briefResult.generationJobId,
    );
    const generatedVersion = draftWorkspace.versions.find(
      (version) => version.sourceJobId === briefResult.generationJobId,
    );
    addEvidence(
      "m1_durable_worker_created_immutable_draft",
      generationJob?.state === "succeeded" &&
        generationJob.attemptCount === 2 &&
        generatedVersion?.source === "ai_assisted" &&
        generatedVersion.state === "draft",
      { generation_attempts: generationJob?.attemptCount ?? 0 },
    );
    if (!generatedVersion) {
      throw new AcceptanceFailure("generated_version_missing");
    }

    await briefFlowAal1.submitDraft({
      contentVersionId: generatedVersion.id,
      correlationId: randomUUID(),
      organizationId: fixture.organizationOne,
    });

    const submittedWorkspace = await briefFlowAal1.loadWorkspace(fixture.organizationOne);
    const submittedVersion = submittedWorkspace.versions.find(
      (version) => version.id === generatedVersion.id,
    );
    addEvidence(
      "m1_operator_submitted_exact_version",
      submittedVersion?.state === "submitted" &&
        submittedVersion.payloadHash === generatedVersion.payloadHash,
    );
    if (!submittedVersion) {
      throw new AcceptanceFailure("submitted_version_missing");
    }

    const preReviewWorkspace = await reviewFlowAal2.loadWorkspace(fixture.organizationOne);
    const reviewCheckStore = new SupabaseReviewCheckStore(new SupabaseRpcClient(workerEnvironment));
    const checkRunner = new AutomatedReviewCheckRunner({
      evidence: {
        record(record) {
          checkEvidence.push(record);
        },
      },
      store: reviewCheckStore,
    });
    const checkRun = await checkRunner.run({
      checkDefinitions: preReviewWorkspace.checkDefinitions,
      contentVersionId: submittedVersion.id,
      correlationId: randomUUID(),
      organizationId: fixture.organizationOne,
      reflection: parseAudioReflection(submittedVersion.payload),
    });
    addEvidence(
      "m1_versioned_automated_checks_recorded",
      checkRun.results.length === 8 &&
        checkRun.results.every((result) => !["error", "fail"].includes(result.outcome)),
      {
        automated_checks: checkRun.results.length,
      },
    );

    const browserCheckWriteDenied = await httpDenies(() =>
      httpJson(config, "POST", "/rest/v1/rpc/m1_record_check_run", {
        apiKey: config.publishableKey,
        bearer: tokenOneAal2,
        body: {
          p_content_version_id: submittedVersion.id,
          p_correlation_id: randomUUID(),
          p_engine_key: "browser_must_fail",
          p_engine_version: "1.0.0",
          p_organization_id: fixture.organizationOne,
          p_results: [],
          p_status: "completed",
        },
      }),
    );
    addEvidence("m1_check_service_role_boundary", browserCheckWriteDenied);

    const aal1PolicyDenied = await studioDenies(() =>
      reviewFlowAal1.activateReviewPolicy({
        correlationId: randomUUID(),
        key: `m1_4_${runId}`,
        organizationId: fixture.organizationOne,
        version: 1,
      }),
    );
    addEvidence("m1_aal1_policy_activation_denied", aal1PolicyDenied);

    const reviewPolicyId = await reviewFlowAal2.activateReviewPolicy({
      correlationId: randomUUID(),
      key: `m1_4_${runId}`,
      organizationId: fixture.organizationOne,
      version: 1,
    });
    const scriptureEvidenceId = await reviewFlowAal2.recordScriptureEvidence({
      contentVersionId: submittedVersion.id,
      correlationId: randomUUID(),
      organizationId: fixture.organizationOne,
      reference: audioReflectionBriefFixture.scripture_references[0]?.reference ?? "Test 1:1",
      sourceCitation:
        audioReflectionBriefFixture.scripture_references[0]?.source_citation ??
        "Synthetic acceptance source",
      translation: audioReflectionBriefFixture.scripture_references[0]?.translation ?? "TEST",
      verificationStatus: "verified",
    });
    const rightsSnapshotId = await reviewFlowAal2.recordRightsSnapshot({
      contentVersionId: submittedVersion.id,
      correlationId: randomUUID(),
      organizationId: fixture.organizationOne,
      sourceSummary: "Synthetic fixture rights cleared for non-production acceptance",
      status: "cleared",
    });
    const reviewIds = {
      editorial: await reviewFlowAal2.recordReview({
        contentVersionId: submittedVersion.id,
        correlationId: randomUUID(),
        decision: "approved",
        evidence: { source: "m1_4_acceptance" },
        lane: "editorial",
        organizationId: fixture.organizationOne,
        reasonCode: "m1_4_acceptance",
      }),
      scripture: await reviewFlowAal2.recordReview({
        contentVersionId: submittedVersion.id,
        correlationId: randomUUID(),
        decision: "approved",
        evidence: { source: "m1_4_acceptance" },
        lane: "scripture",
        organizationId: fixture.organizationOne,
        reasonCode: "m1_4_acceptance",
      }),
      theology: await reviewFlowAal2.recordReview({
        contentVersionId: submittedVersion.id,
        correlationId: randomUUID(),
        decision: "approved",
        evidence: { source: "m1_4_acceptance" },
        lane: "theology",
        organizationId: fixture.organizationOne,
        reasonCode: "m1_4_acceptance",
      }),
    };
    addEvidence(
      "m1_separate_human_governance_evidence",
      Boolean(
        reviewPolicyId &&
          scriptureEvidenceId &&
          rightsSnapshotId &&
          reviewIds.editorial &&
          reviewIds.scripture &&
          reviewIds.theology,
      ),
      { human_review_lanes: 3 },
    );

    const approvalInput = {
      checkRunId: checkRun.checkRunId,
      contentVersionId: submittedVersion.id,
      correlationId: randomUUID(),
      editorialReviewId: reviewIds.editorial,
      organizationId: fixture.organizationOne,
      reasonCode: "m1_4_acceptance",
      reviewPolicyId,
      rightsSnapshotId,
      scriptureEvidenceId,
      scriptureReviewId: reviewIds.scripture,
      theologyReviewId: reviewIds.theology,
    } as const;
    const aal1ApprovalDenied = await studioDenies(() =>
      reviewFlowAal1.approveVersion(approvalInput),
    );
    addEvidence("m1_real_aal1_approval_denied", aal1ApprovalDenied);

    const approvalSnapshotId = await reviewFlowAal2.approveVersion({
      ...approvalInput,
      correlationId: randomUUID(),
    });
    const aal1PackageDenied = await studioDenies(() =>
      reviewFlowAal1.createProductionPackage({
        approvalSnapshotId,
        correlationId: randomUUID(),
        organizationId: fixture.organizationOne,
      }),
    );
    addEvidence("m1_real_aal1_package_denied", aal1PackageDenied);

    const productionPackageId = await reviewFlowAal2.createProductionPackage({
      approvalSnapshotId,
      correlationId: randomUUID(),
      organizationId: fixture.organizationOne,
    });
    const finalWorkspace = await reviewFlowAal2.loadWorkspace(fixture.organizationOne);
    const approval = finalWorkspace.approvalSnapshots.find(
      (item) => item.id === approvalSnapshotId,
    );
    const productionPackage = finalWorkspace.productionPackages.find(
      (item) => item.id === productionPackageId,
    );
    addEvidence(
      "m1_package_integrity",
      approval?.authenticationAssurance === "aal2" &&
        approval.versionPayloadHash === submittedVersion.payloadHash &&
        productionPackage?.approvalSnapshotId === approvalSnapshotId &&
        productionPackage.manifest.content_payload_hash === submittedVersion.payloadHash &&
        productionPackage.manifest.evidence_bundle_hash === approval.evidenceBundleHash &&
        productionPackage.manifestHash.length === 64,
    );

    if (config.m2ArtifactDirectory) {
      await ensurePrivateMediaBucket(config);
      addEvidence("m2_private_bucket_configuration", true);
      const outputSpec = (await gatewayOneAal1.listMediaOutputSpecs()).at(0);
      if (!outputSpec) {
        throw new AcceptanceFailure("m2_output_spec_missing");
      }
      const requestInput = {
        adapterKey: "strongr.synthetic_audio",
        adapterVersion: "1.0.0",
        correlationId: randomUUID(),
        idempotencyKey: `m2-acceptance-${runId}`,
        organizationId: fixture.organizationOne,
        outputSpecId: outputSpec.id,
        productionPackageId,
      } as const;
      const aal1MediaRequestDenied = await studioDenies(() =>
        gatewayOneAal1.invoke("m2_request_media", requestInput),
      );
      addEvidence("m2_real_aal1_media_request_denied", aal1MediaRequestDenied);

      const mediaJobId = await gatewayOneAal2.invoke("m2_request_media", {
        ...requestInput,
        correlationId: randomUUID(),
      });
      const mediaRuntime = createDurableMediaWorkerRuntime(workerEnvironment, {
        evidence: {
          record(record) {
            mediaWorkerEvidence.push(record);
          },
        },
      });
      const mediaSummary = await mediaRuntime.runOnce({
        batchSize: 1,
        retryAfterSeconds: 0,
      });
      addEvidence(
        "m2_durable_media_worker_succeeded",
        mediaSummary.succeeded === 1 &&
          mediaSummary.retried === 0 &&
          mediaSummary.deadLettered === 0,
      );

      const mediaJobs = await gatewayOneAal1.listMediaJobs(fixture.organizationOne);
      const mediaArtifacts = await gatewayOneAal1.listMediaArtifacts(fixture.organizationOne);
      const mediaJob = mediaJobs.find((item) => item.id === mediaJobId);
      const mediaArtifact = mediaArtifacts.find((item) => item.mediaJobId === mediaJobId);
      if (!mediaArtifact) {
        throw new AcceptanceFailure("m2_canonical_artifact_missing");
      }
      mediaObjectPath = mediaArtifact.objectPath;
      addEvidence(
        "m2_canonical_artifact_integrity",
        mediaJob?.state === "succeeded" &&
          mediaJob.attemptCount === 1 &&
          mediaArtifact.productionPackageId === productionPackageId &&
          mediaArtifact.sha256.length === 64,
        {
          byte_count: mediaArtifact.byteCount,
          duration_ms: mediaArtifact.durationMs,
        },
      );

      const crossTenantMedia = await gatewayTwoAal1.listMediaArtifacts(fixture.organizationOne);
      addEvidence("m2_two_tenant_artifact_metadata_isolation", crossTenantMedia.length === 0);
      const exactDownload = await gatewayOneAal1.downloadMediaArtifact(
        fixture.organizationOne,
        mediaArtifact.id,
      );
      addEvidence(
        "m2_exact_private_artifact_retrieval",
        exactDownload.sha256 === mediaArtifact.sha256 &&
          exactDownload.bytes.byteLength === mediaArtifact.byteCount,
      );
      const crossTenantObjectDenied = await studioDenies(
        () => gatewayTwoAal1.downloadMediaArtifact(fixture.organizationOne, mediaArtifact.id),
        ["media_artifact_not_found"],
      );
      addEvidence("m2_cross_tenant_private_object_denied", crossTenantObjectDenied);

      const anonymousObjectResponse = await fetch(
        `${config.supabaseUrl}/storage/v1/object/authenticated/${mediaArtifact.bucketId}/${mediaArtifact.objectPath}`,
        {
          headers: {
            apikey: config.publishableKey,
            Authorization: `Bearer ${config.publishableKey}`,
          },
          method: "GET",
        },
      );
      addEvidence(
        "m2_anonymous_private_object_denied",
        [400, 401, 403, 404].includes(anonymousObjectResponse.status),
      );

      const listResponse = await fetch(
        `${config.supabaseUrl}/storage/v1/object/list/${mediaArtifact.bucketId}`,
        {
          body: JSON.stringify({
            limit: 100,
            prefix: fixture.organizationOne,
          }),
          headers: {
            "Content-Type": "application/json",
            apikey: config.publishableKey,
            Authorization: `Bearer ${tokenOneAal1}`,
          },
          method: "POST",
        },
      );
      let listedObjects: unknown = null;
      try {
        listedObjects = await listResponse.json();
      } catch {
        listedObjects = null;
      }
      addEvidence(
        "m2_browser_bucket_listing_restricted",
        !listResponse.ok || (Array.isArray(listedObjects) && listedObjects.length === 0),
      );

      const mediaReviewId = await gatewayOneAal1.invoke("m2_record_media_review", {
        accessibilityStatus: "approved",
        correlationId: randomUUID(),
        decision: "approved",
        evidence: {
          source: "m2_acceptance",
          transcript_sha256: sha256("synthetic acceptance transcript"),
        },
        mediaArtifactId: mediaArtifact.id,
        organizationId: fixture.organizationOne,
        reasonCode: "m2_acceptance",
        transcriptStatus: "ready",
      });
      const reviews = await gatewayOneAal1.listMediaReviews(fixture.organizationOne);
      const mediaReview = reviews.find((item) => item.id === mediaReviewId);
      addEvidence(
        "m2_human_media_accessibility_evidence",
        mediaReview?.decision === "approved" &&
          mediaReview.transcriptStatus === "ready" &&
          mediaReview.accessibilityStatus === "approved" &&
          mediaReview.evidenceHash.length === 64,
      );

      const stageInput = {
        configuration: {
          release_channel: "private_acceptance",
          target: config.target,
        },
        correlationId: randomUUID(),
        mediaArtifactId: mediaArtifact.id,
        mediaReviewId,
        organizationId: fixture.organizationOne,
        productionPackageId,
      } as const;
      const aal1StageDenied = await studioDenies(() =>
        gatewayOneAal1.invoke("m2_stage_release", stageInput),
      );
      addEvidence("m2_real_aal1_release_staging_denied", aal1StageDenied);
      const stagedReleaseId = await gatewayOneAal2.invoke("m2_stage_release", {
        ...stageInput,
        correlationId: randomUUID(),
      });
      const bundles = await gatewayOneAal1.listStagedReleaseBundles(fixture.organizationOne);
      const bundle = bundles.find((item) => item.id === stagedReleaseId);
      if (!bundle) {
        throw new AcceptanceFailure("m2_staged_release_missing");
      }
      addEvidence(
        "m2_immutable_staged_release_manifest",
        bundle.authenticationAssurance === "aal2" &&
          bundle.mediaArtifactId === mediaArtifact.id &&
          bundle.mediaReviewId === mediaReviewId &&
          bundle.productionPackageId === productionPackageId &&
          bundle.manifestHash.length === 64,
      );

      const backupStarted = Date.now();
      const restoredBytes = writeEncryptedMediaBackup(
        config,
        mediaArtifact,
        bundle,
        exactDownload.bytes,
      );
      addEvidence(
        "m2_independent_encrypted_byte_restore",
        restoredBytes.byteLength === mediaArtifact.byteCount &&
          sha256(restoredBytes) === mediaArtifact.sha256,
        {
          duration_ms: Date.now() - backupStarted,
        },
      );

      const inventoryCounts = runPsql(
        config,
        `
select concat_ws(
  ',',
  (
    select count(*)
    from public.media_artifacts
    where organization_id = '${fixture.organizationOne}'
      and object_path = '${mediaArtifact.objectPath}'
  ),
  (
    select count(*)
    from storage.objects
    where bucket_id = '${mediaArtifact.bucketId}'
      and name = '${mediaArtifact.objectPath}'
  )
);
`,
      );
      addEvidence("m2_database_object_inventory_exact", inventoryCounts === "1,1");

      const storage = new SupabasePrivateMediaStorage(workerEnvironment);
      orphanObjectPath = `${fixture.organizationOne}/${productionPackageId}/${randomUUID()}.wav`;
      const orphanUpload = await storage.uploadWriteOnce(
        mediaArtifact.bucketId,
        orphanObjectPath,
        restoredBytes,
        "audio/wav",
      );
      const orphanCount = runPsql(
        config,
        `
select count(*)
from storage.objects as object
left join public.media_artifacts as artifact
  on artifact.bucket_id = object.bucket_id
 and artifact.object_path = object.name
where object.bucket_id = '${mediaArtifact.bucketId}'
  and object.name = '${orphanObjectPath}'
  and artifact.id is null;
`,
      );
      addEvidence(
        "m2_orphan_object_inventory_detection",
        orphanUpload.disposition === "uploaded" && orphanCount === "1",
      );
      await deleteStorageObject(config, mediaArtifact.bucketId, orphanObjectPath);
      orphanObjectPath = null;

      await deleteStorageObject(config, mediaArtifact.bucketId, mediaArtifact.objectPath);
      const missingCount = runPsql(
        config,
        `
select count(*)
from public.media_artifacts as artifact
left join storage.objects as object
  on object.bucket_id = artifact.bucket_id
 and object.name = artifact.object_path
where artifact.id = '${mediaArtifact.id}'
  and object.id is null;
`,
      );
      addEvidence("m2_missing_object_inventory_detection", missingCount === "1");
      const repairUpload = await storage.uploadWriteOnce(
        mediaArtifact.bucketId,
        mediaArtifact.objectPath,
        restoredBytes,
        "audio/wav",
      );
      const repairedDownload = await gatewayOneAal1.downloadMediaArtifact(
        fixture.organizationOne,
        mediaArtifact.id,
      );
      addEvidence(
        "m2_exact_byte_restore_reconciled",
        repairUpload.disposition === "uploaded" &&
          repairedDownload.sha256 === mediaArtifact.sha256 &&
          repairedDownload.bytes.byteLength === mediaArtifact.byteCount,
      );

      const aal1RevocationDenied = await studioDenies(() =>
        gatewayOneAal1.invoke("m2_revoke_staged_release", {
          correlationId: randomUUID(),
          organizationId: fixture.organizationOne,
          reasonCode: "m2_acceptance_complete",
          stagedReleaseBundleId: stagedReleaseId,
        }),
      );
      addEvidence("m2_real_aal1_release_revocation_denied", aal1RevocationDenied);
      const stagedRevocationId = await gatewayOneAal2.invoke("m2_revoke_staged_release", {
        correlationId: randomUUID(),
        organizationId: fixture.organizationOne,
        reasonCode: "m2_acceptance_complete",
        stagedReleaseBundleId: stagedReleaseId,
      });
      const revocations = await gatewayOneAal1.listStagedReleaseRevocations(
        fixture.organizationOne,
      );
      addEvidence(
        "m2_aal2_release_revocation_recorded",
        revocations.some(
          (item) =>
            item.id === stagedRevocationId &&
            item.stagedReleaseBundleId === stagedReleaseId &&
            item.authenticationAssurance === "aal2",
        ),
      );
      const revokedRestageDenied = await studioDenies(
        () =>
          gatewayOneAal2.invoke("m2_stage_release", {
            ...stageInput,
            correlationId: randomUUID(),
          }),
        ["55000"],
      );
      addEvidence("m2_revoked_staged_authority_cannot_restage", revokedRestageDenied);
    }

    const accessibilityDefinition = preReviewWorkspace.checkDefinitions.find(
      (definition) => definition.key === "accessibility.transcript_ready",
    );
    const accessibilityResult = checkRun.results.find(
      (result) => result.checkDefinitionId === accessibilityDefinition?.id,
    );
    addEvidence(
      "m1_accessibility_transcript_contract",
      accessibilityDefinition?.blocksApproval === true &&
        accessibilityResult?.outcome === "pass" &&
        accessibilityResult.detailCode === "m1_3.transcript_ready",
    );

    await reviewFlowAal2.revokeApproval({
      approvalSnapshotId,
      correlationId: randomUUID(),
      organizationId: fixture.organizationOne,
      reasonCode: "m1_4_revocation_proof",
    });
    const revokedPackageDenied = await studioDenies(
      () =>
        reviewFlowAal2.createProductionPackage({
          approvalSnapshotId,
          correlationId: randomUUID(),
          organizationId: fixture.organizationOne,
        }),
      ["55000"],
    );
    addEvidence("m1_revoked_approval_cannot_create_package", revokedPackageDenied);

    const health = parseHealth(config);
    addEvidence("m1_operational_health", health.status === "ok", {
      health_status: typeof health.status === "string" ? health.status : "invalid",
    });

    const serializedEvidence = JSON.stringify({
      checkEvidence,
      evidence,
      mediaWorkerEvidence,
      workerEvidence,
    });
    addEvidence(
      "m1_evidence_privacy",
      !serializedEvidence.includes(audioReflectionBriefFixture.title) &&
        !/(?:access_token|apikey|authorization|database_url|sb_secret_|eyJ[a-zA-Z0-9_-]{20,}\.)/i.test(
          serializedEvidence,
        ),
      {
        check_evidence_records: checkEvidence.length,
        media_worker_evidence_records: mediaWorkerEvidence.length,
        worker_evidence_records: workerEvidence.length,
      },
    );
  } finally {
    let mediaObjectCleanupPassed = true;
    const mediaObjectPaths = new Set<string>(
      [orphanObjectPath, mediaObjectPath].filter((value): value is string => Boolean(value)),
    );
    if (config.m2ArtifactDirectory && databaseSeeded) {
      try {
        const discoveredPaths = runPsql(
          config,
          `
select object.name
from storage.objects as object
where object.bucket_id = 'strongr-os-media'
  and object.name like '${fixture.organizationOne}/%';
`,
        );
        for (const objectPath of discoveredPaths.split(/\r?\n/)) {
          if (objectPath) {
            mediaObjectPaths.add(objectPath);
          }
        }
      } catch {
        mediaObjectCleanupPassed = false;
      }
    }
    for (const objectPath of mediaObjectPaths) {
      if (!objectPath) {
        continue;
      }
      try {
        await deleteStorageObject(config, "strongr-os-media", objectPath);
      } catch {
        mediaObjectCleanupPassed = false;
      }
    }
    if (config.m2ArtifactDirectory) {
      evidence.push({
        status: mediaObjectCleanupPassed ? "pass" : "fail",
        test: "m2_fixture_storage_cleanup",
      });
    }

    let databaseCleanupPassed = !databaseSeeded;
    if (databaseSeeded) {
      try {
        cleanupDatabase(
          config,
          [fixture.organizationOne, fixture.organizationTwo],
          [fixture.userOne, fixture.userTwo],
        );
        databaseCleanupPassed = true;
      } catch {
        databaseCleanupPassed = false;
      }
    }
    evidence.push({
      status: databaseCleanupPassed ? "pass" : "fail",
      test: "m1_fixture_database_cleanup",
    });

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
      test: "m1_fixture_auth_cleanup",
    });
  }
}

async function main(): Promise<void> {
  let fatalCode: string | null = null;
  let target = "unknown";
  try {
    const config = loadAcceptanceConfig();
    target = config.target;
    await runAcceptance(config);
  } catch (error) {
    fatalCode =
      error instanceof AcceptanceFailure
        ? error.code
        : error instanceof StudioApiError
          ? `studio_${error.code}`
          : error instanceof AcceptanceHttpFailure
            ? `http_${error.status}`
            : "unexpected_acceptance_failure";
    evidence.push({
      error_code: fatalCode,
      status: "fail",
      test: "strongr_os_m1_application_acceptance",
    });
  }

  for (const record of evidence) {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  }
  for (const record of workerEvidence) {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  }
  for (const record of checkEvidence) {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  }
  for (const record of mediaWorkerEvidence) {
    process.stdout.write(`${JSON.stringify(record)}\n`);
  }

  const failures = evidence.filter((record) => record.status !== "pass");
  const milestone = process.env.STRONGR_OS_M2_ARTIFACT_DIR?.trim() ? "m2" : "m1";
  const summary = {
    failed: failures.length,
    passed: evidence.length - failures.length,
    status: failures.length === 0 && fatalCode === null ? "pass" : "fail",
    target,
    test: `strongr_os_${milestone}_acceptance_summary`,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  process.exitCode = summary.status === "pass" ? 0 : 1;
}

await main();
