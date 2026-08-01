import {
  createDurableWorkerRuntime,
  type DurableWorkerBatchSummary,
  type WorkerEnvironment,
} from "../../../apps/worker/src/index.ts";
import { openAiStrongrDailyV2ProviderConfig } from "../../../packages/ai/src/index.ts";
import {
  type ContentProfileSelection,
  parseContentProfileSelection,
} from "../../../packages/content-profiles/src/schema.ts";
import { strongrDailyContentProfileSourceManifestV1 } from "../../../packages/content-profiles/src/strongr-daily-v1.ts";

export const strongrDailyGenerationBoundary = Object.freeze({
  allowedOrigin: "https://strongr-studio-preview.meetwagon.chatgpt.site",
  projectRef: "fifrlyddmjkogmdvyjdp",
  supabaseUrl: "https://fifrlyddmjkogmdvyjdp.supabase.co",
  workerId: "strongr-daily-phase4b-edge",
});

export interface StrongrDailyGenerateEnvironment {
  readonly OPENAI_API_KEY?: string | undefined;
  readonly SUPABASE_ANON_KEY?: string | undefined;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
  readonly SUPABASE_URL?: string | undefined;
}

export interface StrongrDailyGenerationRuntime {
  runJobOnce(generationJobId: string): Promise<DurableWorkerBatchSummary>;
}

export type StrongrDailyGenerationRuntimeFactory = (
  environment: WorkerEnvironment,
) => StrongrDailyGenerationRuntime;

export type StrongrDailyGenerateFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface HandlerOptions {
  readonly authorizeContentProfile?: (
    selection: ContentProfileSelection,
    sourceManifestChecksum: string,
  ) => boolean;
  readonly environment: StrongrDailyGenerateEnvironment;
  readonly fetch?: StrongrDailyGenerateFetch;
  readonly runtimeFactory?: StrongrDailyGenerationRuntimeFactory;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

export type StrongrDailyGenerateSafeErrorCode =
  | "authentication_failed"
  | "authentication_required"
  | "content_profile_not_active"
  | "content_type_not_allowed"
  | "development_project_not_allowed"
  | "generation_job_not_claimable"
  | "generation_job_not_found"
  | "generation_readback_unavailable"
  | "generation_service_unavailable"
  | "invalid_request"
  | "method_not_allowed"
  | "origin_not_allowed"
  | "permission_denied"
  | "request_too_large"
  | "server_configuration_invalid";

interface GenerationJobRecord {
  readonly attemptCount: number;
  readonly contentProfile: ContentProfileSelection | null;
  readonly contentProfileSourceManifestChecksum: string | null;
  readonly generationJobId: string;
  readonly maxAttempts: number;
  readonly organizationId: string;
  readonly promptKey: string;
  readonly promptVersion: number;
  readonly state: "queued" | "running" | "succeeded" | "failed" | "dead_letter" | "cancelled";
}

interface GenerationReadback {
  readonly contentVersionId: string | null;
  readonly costMicrounits: number | null;
  readonly errorCode: string | null;
  readonly generationJobId: string;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly state: GenerationJobRecord["state"];
}

const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const sha256Pattern = /^[a-f0-9]{64}$/;

function safeHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": strongrDailyGenerationBoundary.allowedOrigin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function safeResponse(status: number, payload: UnknownRecord): Response {
  return new Response(JSON.stringify(payload), { headers: safeHeaders(), status });
}

function safeError(status: number, code: StrongrDailyGenerateSafeErrorCode): Response {
  return safeResponse(status, { error_code: code });
}

function requireRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function requireBearer(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 20 ? token : null;
}

function requireRequestBody(value: unknown): {
  readonly generationJobId: string;
} | null {
  const record = requireRecord(value);
  if (!record) return null;
  const keys = Object.keys(record).sort();
  if (keys.length !== 1 || keys[0] !== "generation_job_id") {
    return null;
  }
  if (typeof record.generation_job_id !== "string" || !uuidPattern.test(record.generation_job_id)) {
    return null;
  }
  return Object.freeze({
    generationJobId: record.generation_job_id,
  });
}

function requireConfiguration(environment: StrongrDailyGenerateEnvironment): {
  readonly anonKey: string;
  readonly openAiApiKey: string;
  readonly serviceRoleKey: string;
  readonly supabaseUrl: string;
} | null {
  const anonKey = environment.SUPABASE_ANON_KEY?.trim();
  const openAiApiKey = environment.OPENAI_API_KEY?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = environment.SUPABASE_URL?.trim().replace(/\/$/, "");
  if (
    !anonKey ||
    anonKey.length < 20 ||
    !openAiApiKey ||
    openAiApiKey.length < 20 ||
    !serviceRoleKey ||
    serviceRoleKey.length < 32 ||
    !supabaseUrl
  ) {
    return null;
  }
  return Object.freeze({ anonKey, openAiApiKey, serviceRoleKey, supabaseUrl });
}

function userHeaders(anonKey: string, bearer: string, includeContentType = false): HeadersInit {
  return {
    Accept: "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${bearer}`,
    ...(includeContentType ? { "Content-Type": "application/json" } : {}),
  };
}

function privilegedHeaders(serviceRoleKey: string): HeadersInit {
  return {
    Accept: "application/json",
    apikey: serviceRoleKey,
    ...(serviceRoleKey.startsWith("sb_secret_")
      ? {}
      : { Authorization: `Bearer ${serviceRoleKey}` }),
  };
}

async function authenticate(
  fetch: StrongrDailyGenerateFetch,
  supabaseUrl: string,
  anonKey: string,
  bearer: string,
): Promise<boolean> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: userHeaders(anonKey, bearer),
    method: "GET",
  });
  if (!response.ok) return false;
  const user = requireRecord(await readJson(response));
  return typeof user?.id === "string" && uuidPattern.test(user.id);
}

async function hasCreatePermission(
  fetch: StrongrDailyGenerateFetch,
  supabaseUrl: string,
  anonKey: string,
  bearer: string,
  organizationId: string,
): Promise<boolean> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/has_permission`, {
    body: JSON.stringify({
      p_organization_id: organizationId,
      p_permission_key: "content.create",
    }),
    headers: userHeaders(anonKey, bearer, true),
    method: "POST",
  });
  return response.ok && (await readJson(response)) === true;
}

function parseGenerationJob(value: unknown, generationJobId: string): GenerationJobRecord | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const row = requireRecord(value[0]);
  if (!row) return null;
  const states = ["queued", "running", "succeeded", "failed", "dead_letter", "cancelled"];
  let contentProfile: ContentProfileSelection | null;
  const rawProfileFields = [
    row.content_profile_id,
    row.content_profile_version,
    row.content_profile_checksum,
    row.content_profile_content_type,
    row.content_profile_source_manifest_checksum,
  ];
  const nullProfileFields = rawProfileFields.filter((field) => field === null).length;
  if (nullProfileFields === rawProfileFields.length) {
    contentProfile = null;
  } else if (nullProfileFields > 0) {
    return null;
  } else {
    if (
      typeof row.content_profile_source_manifest_checksum !== "string" ||
      !sha256Pattern.test(row.content_profile_source_manifest_checksum)
    ) {
      return null;
    }
    try {
      contentProfile = parseContentProfileSelection({
        canonical_checksum: row.content_profile_checksum,
        content_type: row.content_profile_content_type,
        profile_id: row.content_profile_id,
        profile_version: row.content_profile_version,
      });
    } catch {
      return null;
    }
  }
  if (
    row.id !== generationJobId ||
    typeof row.organization_id !== "string" ||
    !uuidPattern.test(row.organization_id) ||
    typeof row.state !== "string" ||
    !states.includes(row.state) ||
    typeof row.attempt_count !== "number" ||
    !Number.isInteger(row.attempt_count) ||
    typeof row.max_attempts !== "number" ||
    !Number.isInteger(row.max_attempts) ||
    typeof row.prompt_key !== "string" ||
    typeof row.prompt_version !== "number" ||
    !Number.isInteger(row.prompt_version)
  ) {
    return null;
  }
  return Object.freeze({
    attemptCount: row.attempt_count,
    contentProfile,
    contentProfileSourceManifestChecksum:
      contentProfile === null ? null : (row.content_profile_source_manifest_checksum as string),
    generationJobId,
    maxAttempts: row.max_attempts,
    organizationId: row.organization_id,
    promptKey: row.prompt_key,
    promptVersion: row.prompt_version,
    state: row.state as GenerationJobRecord["state"],
  });
}

async function readGenerationJob(
  fetch: StrongrDailyGenerateFetch,
  supabaseUrl: string,
  anonKey: string,
  bearer: string,
  generationJobId: string,
): Promise<GenerationJobRecord | null> {
  const query = new URLSearchParams({
    id: `eq.${generationJobId}`,
    limit: "1",
    select:
      "id,organization_id,state,attempt_count,max_attempts,prompt_key,prompt_version,content_profile_id,content_profile_version,content_profile_checksum,content_profile_content_type,content_profile_source_manifest_checksum",
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/generation_jobs?${query.toString()}`, {
    headers: userHeaders(anonKey, bearer),
    method: "GET",
  });
  if (!response.ok) return null;
  return parseGenerationJob(await readJson(response), generationJobId);
}

function optionalNonNegativeInteger(record: UnknownRecord | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function optionalSafeCode(record: UnknownRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && /^[a-z][a-z0-9_.-]{0,79}$/.test(value) ? value : null;
}

function firstRecord(value: unknown): UnknownRecord | null {
  return Array.isArray(value) && value.length === 1 ? requireRecord(value[0]) : null;
}

async function readGenerationResult(
  fetch: StrongrDailyGenerateFetch,
  configuration: {
    readonly serviceRoleKey: string;
    readonly supabaseUrl: string;
  },
  generationJobId: string,
  organizationId: string,
): Promise<GenerationReadback | null> {
  const common = {
    generation_job_id: `eq.${generationJobId}`,
    organization_id: `eq.${organizationId}`,
  };
  const jobQuery = new URLSearchParams({
    id: `eq.${generationJobId}`,
    limit: "1",
    organization_id: `eq.${organizationId}`,
    select: "id,state,last_error_code",
  });
  const versionQuery = new URLSearchParams({
    limit: "1",
    organization_id: `eq.${organizationId}`,
    select: "id",
    source_job_id: `eq.${generationJobId}`,
  });
  const attemptQuery = new URLSearchParams({
    ...common,
    limit: "1",
    order: "attempt_number.desc",
    select: "input_tokens,output_tokens,cost_microunits,error_code",
  });
  const headers = privilegedHeaders(configuration.serviceRoleKey);
  const [jobResponse, versionResponse, attemptResponse] = await Promise.all([
    fetch(`${configuration.supabaseUrl}/rest/v1/generation_jobs?${jobQuery.toString()}`, {
      headers,
      method: "GET",
    }),
    fetch(`${configuration.supabaseUrl}/rest/v1/content_versions?${versionQuery.toString()}`, {
      headers,
      method: "GET",
    }),
    fetch(
      `${configuration.supabaseUrl}/rest/v1/generation_job_attempts?${attemptQuery.toString()}`,
      { headers, method: "GET" },
    ),
  ]);
  if (!jobResponse.ok || !versionResponse.ok || !attemptResponse.ok) return null;
  const job = firstRecord(await readJson(jobResponse));
  const version = firstRecord(await readJson(versionResponse));
  const attempts = await readJson(attemptResponse);
  const attempt =
    Array.isArray(attempts) && attempts.length <= 1
      ? attempts.length === 1
        ? requireRecord(attempts[0])
        : null
      : null;
  if (
    !job ||
    job.id !== generationJobId ||
    typeof job.state !== "string" ||
    !["queued", "running", "succeeded", "failed", "dead_letter", "cancelled"].includes(job.state)
  ) {
    return null;
  }
  const contentVersionId =
    version && typeof version.id === "string" && uuidPattern.test(version.id) ? version.id : null;
  if (job.state === "succeeded" && !contentVersionId) return null;
  return Object.freeze({
    contentVersionId,
    costMicrounits: optionalNonNegativeInteger(attempt, "cost_microunits"),
    errorCode: optionalSafeCode(attempt, "error_code") ?? optionalSafeCode(job, "last_error_code"),
    generationJobId,
    inputTokens: optionalNonNegativeInteger(attempt, "input_tokens"),
    outputTokens: optionalNonNegativeInteger(attempt, "output_tokens"),
    state: job.state as GenerationReadback["state"],
  });
}

function generationResponse(readback: GenerationReadback): Response {
  return safeResponse(200, {
    content_version_id: readback.contentVersionId,
    error_code: readback.errorCode,
    estimated_cost_microunits: readback.costMicrounits,
    generation_job_id: readback.generationJobId,
    input_tokens: readback.inputTokens,
    output_tokens: readback.outputTokens,
    state: readback.state,
  });
}

function createWorkerEnvironment(configuration: {
  readonly openAiApiKey: string;
  readonly serviceRoleKey: string;
  readonly supabaseUrl: string;
}): WorkerEnvironment {
  return Object.freeze({
    generationProvider: "openai",
    openAiApiKey: configuration.openAiApiKey,
    openAiModel: openAiStrongrDailyV2ProviderConfig.model,
    privilegedKeyKind: configuration.serviceRoleKey.startsWith("sb_secret_")
      ? "secret"
      : "legacy_service_role",
    supabasePrivilegedKey: configuration.serviceRoleKey,
    supabaseUrl: configuration.supabaseUrl,
    workerId: strongrDailyGenerationBoundary.workerId,
  });
}

function defaultRuntimeFactory(environment: WorkerEnvironment): StrongrDailyGenerationRuntime {
  return createDurableWorkerRuntime(environment);
}

export function createStrongrDailyGenerateHandler(options: HandlerOptions) {
  const fetch = options.fetch ?? globalThis.fetch;
  const runtimeFactory = options.runtimeFactory ?? defaultRuntimeFactory;
  const authorizeContentProfile = options.authorizeContentProfile ?? (() => false);

  return async function strongrDailyGenerate(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    if (origin !== strongrDailyGenerationBoundary.allowedOrigin) {
      return safeError(403, "origin_not_allowed");
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: safeHeaders(), status: 204 });
    }
    if (request.method !== "POST") {
      return safeError(405, "method_not_allowed");
    }

    const configuration = requireConfiguration(options.environment);
    if (!configuration) return safeError(503, "server_configuration_invalid");
    if (configuration.supabaseUrl !== strongrDailyGenerationBoundary.supabaseUrl) {
      return safeError(403, "development_project_not_allowed");
    }
    const bearer = requireBearer(request);
    if (!bearer) return safeError(401, "authentication_required");

    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") return safeError(415, "content_type_not_allowed");

    let body: ReturnType<typeof requireRequestBody>;
    try {
      const text = await request.text();
      if (new TextEncoder().encode(text).byteLength > 4_096) {
        return safeError(413, "request_too_large");
      }
      body = requireRequestBody(JSON.parse(text));
    } catch {
      body = null;
    }
    if (!body) return safeError(400, "invalid_request");

    try {
      if (!(await authenticate(fetch, configuration.supabaseUrl, configuration.anonKey, bearer))) {
        return safeError(401, "authentication_failed");
      }
      const job = await readGenerationJob(
        fetch,
        configuration.supabaseUrl,
        configuration.anonKey,
        bearer,
        body.generationJobId,
      );
      if (!job) return safeError(404, "generation_job_not_found");
      if (
        !(await hasCreatePermission(
          fetch,
          configuration.supabaseUrl,
          configuration.anonKey,
          bearer,
          job.organizationId,
        ))
      ) {
        return safeError(403, "permission_denied");
      }
      if (job.state !== "queued") {
        const readback = await readGenerationResult(
          fetch,
          configuration,
          job.generationJobId,
          job.organizationId,
        );
        return readback
          ? generationResponse(readback)
          : safeError(503, "generation_readback_unavailable");
      }
      if (
        job.attemptCount !== 0 ||
        job.promptKey !== openAiStrongrDailyV2ProviderConfig.promptKey ||
        job.promptVersion !== openAiStrongrDailyV2ProviderConfig.promptVersion
      ) {
        return safeError(409, "generation_job_not_claimable");
      }
      if (
        !job.contentProfile ||
        job.contentProfileSourceManifestChecksum !==
          strongrDailyContentProfileSourceManifestV1.canonical_checksum ||
        !authorizeContentProfile(job.contentProfile, job.contentProfileSourceManifestChecksum)
      ) {
        return safeError(409, "content_profile_not_active");
      }

      const runtime = runtimeFactory(createWorkerEnvironment(configuration));
      await runtime.runJobOnce(job.generationJobId);
      const readback = await readGenerationResult(
        fetch,
        configuration,
        job.generationJobId,
        job.organizationId,
      );
      return readback
        ? generationResponse(readback)
        : safeError(503, "generation_readback_unavailable");
    } catch {
      return safeError(503, "generation_service_unavailable");
    }
  };
}
