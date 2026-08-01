import {
  createOpenAiStrongrDailyV2Adapter,
  estimateOpenAiStrongrDailyV2Generation,
  GenerationProviderError,
  openAiStrongrDailyPhase4b5OneCallProviderConfig,
} from "../../../packages/ai/src/index.ts";
import { parseStrongrDailyAudioReflectionV2Brief } from "../../../packages/content-schemas/src/index.ts";
import {
  guidedAudioReflectionV1Proposal,
  guidedAudioReflectionV1ProposalSourceManifestV2,
} from "../../../packages/content-profiles/src/guided-audio-reflection-v1-proposal.ts";
import { parseContentProfileSelection } from "../../../packages/content-profiles/src/schema.ts";

export const strongrDailyPhase4b5Boundary = Object.freeze({
  allowedOrigin: "https://strongr-studio-preview.meetwagon.chatgpt.site",
  projectRef: "fifrlyddmjkogmdvyjdp",
  supabaseUrl: "https://fifrlyddmjkogmdvyjdp.supabase.co",
});

export interface Phase4b5Environment {
  readonly OPENAI_API_KEY?: string;
  readonly SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly SUPABASE_URL?: string;
}

export type Phase4b5Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface HandlerOptions {
  readonly environment: Phase4b5Environment;
  readonly fetch?: Phase4b5Fetch;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

export type Phase4b5SafeErrorCode =
  | "authentication_failed"
  | "authentication_required"
  | "development_project_not_allowed"
  | "generation_already_consumed"
  | "generation_provider_cost_limit_exceeded"
  | "generation_service_unavailable"
  | "invalid_request"
  | "method_not_allowed"
  | "origin_not_allowed"
  | "permission_denied"
  | "server_configuration_invalid";

const uuidPattern = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

function headers(): HeadersInit {
  return {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": strongrDailyPhase4b5Boundary.allowedOrigin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function response(status: number, body: UnknownRecord): Response {
  return new Response(JSON.stringify(body), { headers: headers(), status });
}

function failure(status: number, errorCode: Phase4b5SafeErrorCode): Response {
  return response(status, { error_code: errorCode });
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

async function json(value: Response): Promise<unknown> {
  try {
    return await value.json();
  } catch {
    return null;
  }
}

async function requestJson(value: Request): Promise<unknown> {
  try {
    return await value.json();
  } catch {
    return null;
  }
}

function bearer(request: Request): string | null {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7).trim();
  return token.length > 20 ? token : null;
}

function configuration(environment: Phase4b5Environment) {
  const anonKey = environment.SUPABASE_ANON_KEY?.trim();
  const openAiApiKey = environment.OPENAI_API_KEY?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = environment.SUPABASE_URL?.trim().replace(/\/$/, "");
  if (
    !anonKey ||
    !openAiApiKey ||
    !serviceRoleKey ||
    supabaseUrl !== strongrDailyPhase4b5Boundary.supabaseUrl
  ) {
    return null;
  }
  return Object.freeze({ anonKey, openAiApiKey, serviceRoleKey, supabaseUrl });
}

function userHeaders(anonKey: string, token: string, contentType = false): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    ...(contentType ? { "Content-Type": "application/json" } : {}),
  };
}

function serviceHeaders(serviceRoleKey: string): HeadersInit {
  return {
    Accept: "application/json",
    apikey: serviceRoleKey,
    ...(serviceRoleKey.startsWith("sb_secret_")
      ? {}
      : { Authorization: `Bearer ${serviceRoleKey}` }),
    "Content-Type": "application/json",
  };
}

function requestBody(
  value: unknown,
): { readonly briefId: string; readonly organizationId: string } | null {
  const body = record(value);
  if (!body || Object.keys(body).sort().join(",") !== "brief_id,organization_id") return null;
  if (typeof body.brief_id !== "string" || typeof body.organization_id !== "string") return null;
  if (!uuidPattern.test(body.brief_id) || !uuidPattern.test(body.organization_id)) return null;
  return Object.freeze({ briefId: body.brief_id, organizationId: body.organization_id });
}

function safeProviderFailure(error: unknown): string {
  return error instanceof GenerationProviderError && /^[a-z][a-z0-9_.-]{0,79}$/.test(error.safeCode)
    ? error.safeCode
    : "generation.provider_unavailable";
}

async function completeFailure(
  fetch: Phase4b5Fetch,
  supabaseUrl: string,
  serviceRoleKey: string,
  authorizationId: string,
  safeErrorCode: string,
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/rpc/m1_complete_phase4b5_one_call`, {
    body: JSON.stringify({
      p_actual_cost_microunits: null,
      p_attempt_state: "failed",
      p_authorization_id: authorizationId,
      p_input_tokens: null,
      p_output_hash: null,
      p_output_tokens: null,
      p_provider_response_id: null,
      p_quarantined_payload: null,
      p_returned_model: null,
      p_safe_error_code: safeErrorCode,
      p_total_tokens: null,
    }),
    headers: serviceHeaders(serviceRoleKey),
    method: "POST",
  });
}

export function createStrongrDailyPhase4b5OnceHandler(options: HandlerOptions) {
  const fetch = options.fetch ?? globalThis.fetch;
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS")
      return new Response(null, { headers: headers(), status: 204 });
    if (request.method !== "POST") return failure(405, "method_not_allowed");
    if (request.headers.get("origin") !== strongrDailyPhase4b5Boundary.allowedOrigin) {
      return failure(403, "origin_not_allowed");
    }
    const config = configuration(options.environment);
    if (!config) return failure(503, "server_configuration_invalid");
    const token = bearer(request);
    if (!token) return failure(401, "authentication_required");
    const body = requestBody(await requestJson(request));
    if (!body) return failure(400, "invalid_request");

    const auth = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: userHeaders(config.anonKey, token),
      method: "GET",
    });
    const user = auth.ok ? record(await json(auth)) : null;
    if (typeof user?.id !== "string" || !uuidPattern.test(user.id))
      return failure(401, "authentication_failed");

    const briefResponse = await fetch(
      `${config.supabaseUrl}/rest/v1/content_briefs?id=eq.${body.briefId}&organization_id=eq.${body.organizationId}&select=id,organization_id,payload,schema_id,content_profile_id,content_profile_version,content_profile_checksum,content_profile_content_type,content_profile_source_manifest_checksum`,
      { headers: userHeaders(config.anonKey, token), method: "GET" },
    );
    const rows = briefResponse.ok ? await json(briefResponse) : null;
    const briefRow = Array.isArray(rows) && rows.length === 1 ? record(rows[0]) : null;
    if (!briefRow || !record(briefRow.payload)) return failure(404, "invalid_request");

    let brief: ReturnType<typeof parseStrongrDailyAudioReflectionV2Brief>;
    let profile: ReturnType<typeof parseContentProfileSelection>;
    try {
      brief = parseStrongrDailyAudioReflectionV2Brief(briefRow.payload);
      profile = parseContentProfileSelection({
        canonical_checksum: briefRow.content_profile_checksum,
        content_type: briefRow.content_profile_content_type,
        profile_id: briefRow.content_profile_id,
        profile_version: briefRow.content_profile_version,
      });
    } catch {
      return failure(409, "invalid_request");
    }
    if (
      briefRow.schema_id !== brief.schema_id ||
      brief.content_profile?.canonical_checksum !==
        guidedAudioReflectionV1Proposal.canonical_checksum ||
      profile.canonical_checksum !== guidedAudioReflectionV1Proposal.canonical_checksum ||
      briefRow.content_profile_source_manifest_checksum !==
        guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum
    )
      return failure(409, "invalid_request");

    const estimate = estimateOpenAiStrongrDailyV2Generation(brief);
    if (estimate.worstCaseCostMicrounits > 100_000) {
      return failure(409, "generation_provider_cost_limit_exceeded");
    }
    const start = await fetch(`${config.supabaseUrl}/rest/v1/rpc/m1_begin_phase4b5_one_call`, {
      body: JSON.stringify({
        p_brief_id: body.briefId,
        p_organization_id: body.organizationId,
        p_pre_call_estimate_microunits: estimate.worstCaseCostMicrounits,
      }),
      headers: userHeaders(config.anonKey, token, true),
      method: "POST",
    });
    const authorizationId = start.ok ? await json(start) : null;
    if (typeof authorizationId !== "string" || !uuidPattern.test(authorizationId)) {
      return failure(
        start.status === 409 ? 409 : 403,
        start.status === 409 ? "generation_already_consumed" : "permission_denied",
      );
    }

    try {
      const adapter = createOpenAiStrongrDailyV2Adapter({
        apiKey: config.openAiApiKey,
        authorizeContentProfile: (selection, manifest) =>
          selection.canonical_checksum === guidedAudioReflectionV1Proposal.canonical_checksum &&
          manifest === guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
        fetch: (input, init) => fetch(input, init),
        promptKey: openAiStrongrDailyPhase4b5OneCallProviderConfig.promptKey,
        sourceManifestChecksum: guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
      });
      const result = await adapter.generate({
        brief,
        contentProfile: profile,
        contentProfileSourceManifestChecksum:
          guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
        correlationId: authorizationId as `${string}-${string}-${string}-${string}-${string}`,
        generationJobId: authorizationId as `${string}-${string}-${string}-${string}-${string}`,
        organizationId: body.organizationId as `${string}-${string}-${string}-${string}-${string}`,
        promptKey: openAiStrongrDailyPhase4b5OneCallProviderConfig.promptKey,
        promptVersion: openAiStrongrDailyPhase4b5OneCallProviderConfig.promptVersion,
      });
      const completed = await fetch(
        `${config.supabaseUrl}/rest/v1/rpc/m1_complete_phase4b5_one_call`,
        {
          body: JSON.stringify({
            p_actual_cost_microunits: result.usage?.estimatedCostMicrounits ?? null,
            p_attempt_state: "quarantined",
            p_authorization_id: authorizationId,
            p_input_tokens: result.usage?.inputTokens ?? null,
            p_output_hash: result.outputHash,
            p_output_tokens: result.usage?.outputTokens ?? null,
            p_provider_response_id: result.providerResponseId,
            p_quarantined_payload: result.output,
            p_returned_model: result.model,
            p_safe_error_code: null,
            p_total_tokens: result.usage?.totalTokens ?? null,
          }),
          headers: serviceHeaders(config.serviceRoleKey),
          method: "POST",
        },
      );
      if (!completed.ok) return failure(503, "generation_service_unavailable");
      return response(200, {
        actual_cost_microunits: result.usage?.estimatedCostMicrounits ?? null,
        authorization_id: authorizationId,
        error_code: null,
        model: result.model,
        output_tokens: result.usage?.outputTokens ?? null,
        pre_call_estimate_microunits: estimate.worstCaseCostMicrounits,
        state: "quarantined",
      });
    } catch (error) {
      await completeFailure(
        fetch,
        config.supabaseUrl,
        config.serviceRoleKey,
        authorizationId,
        safeProviderFailure(error),
      );
      return failure(502, "generation_service_unavailable");
    }
  };
}
