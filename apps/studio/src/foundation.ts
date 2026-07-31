import type {
  BrowserCommandArguments,
  BrowserCommandName,
  BrowserCommandResult,
  GenerationJobState,
  M2TenantReadGateway,
  TenantReadGateway,
  Uuid,
} from "../../../packages/contracts/src/index.ts";

export interface StudioCommandGateway {
  invoke<Name extends BrowserCommandName>(
    command: Name,
    arguments_: BrowserCommandArguments[Name],
  ): Promise<BrowserCommandResult<Name>>;
}

export interface StartGenerationInput {
  readonly generationJobId: Uuid;
}

export const studioGenerationSafeErrorCodes = [
  "api_error",
  "authentication_failed",
  "authentication_required",
  "content_type_not_allowed",
  "development_project_not_allowed",
  "generation.adapter_failed",
  "generation.invalid_brief",
  "generation.max_attempts_exceeded",
  "generation.provider_authentication_failed",
  "generation.provider_brief_mismatch",
  "generation.provider_cost_limit_exceeded",
  "generation.provider_invalid_response",
  "generation.provider_rate_limited",
  "generation.provider_rejected",
  "generation.provider_timeout",
  "generation.provider_unavailable",
  "generation.provider_unsupported_brief",
  "generation.provider_unsupported_prompt",
  "generation.provenance_mismatch",
  "generation_job_not_claimable",
  "generation_job_not_found",
  "generation_readback_unavailable",
  "generation_service_unavailable",
  "invalid_request",
  "method_not_allowed",
  "origin_not_allowed",
  "permission_denied",
  "request_too_large",
  "server_configuration_invalid",
] as const;

export type StudioGenerationSafeErrorCode = (typeof studioGenerationSafeErrorCodes)[number];

export function isStudioGenerationSafeErrorCode(
  value: unknown,
): value is StudioGenerationSafeErrorCode {
  return studioGenerationSafeErrorCodes.includes(value as StudioGenerationSafeErrorCode);
}

export interface StartGenerationResult {
  readonly contentVersionId: Uuid | null;
  readonly errorCode: StudioGenerationSafeErrorCode | null;
  readonly estimatedCostMicrounits: number | null;
  readonly generationJobId: Uuid;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly state: GenerationJobState;
}

export interface StudioGenerationGateway {
  startGeneration(input: StartGenerationInput): Promise<StartGenerationResult>;
}

export interface StudioFoundation {
  readonly reads: TenantReadGateway;
  readonly mediaReads?: M2TenantReadGateway;
  readonly commands: StudioCommandGateway;
  readonly generation?: StudioGenerationGateway;
}

export function createStudioFoundation(
  reads: TenantReadGateway,
  commands: StudioCommandGateway,
  mediaReads?: M2TenantReadGateway,
  generation?: StudioGenerationGateway,
): StudioFoundation {
  return Object.freeze({
    commands,
    reads,
    ...(mediaReads ? { mediaReads } : {}),
    ...(generation ? { generation } : {}),
  });
}
