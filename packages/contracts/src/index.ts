export type Uuid = string;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export const browserCommands = Object.freeze({
  createAudioBrief: "m1_create_audio_brief",
  createManualVersion: "m1_create_manual_version",
  requestGeneration: "m1_request_generation",
  submitVersion: "m1_submit_version",
} as const);

export const workerCommands = Object.freeze({
  acknowledgeOutboxEvent: "m0_ack_outbox_event",
  beginGenerationAttempt: "m1_begin_generation_attempt",
  claimGenerationEvents: "m1_claim_generation_events",
  completeGenerationAttempt: "m1_complete_generation_attempt",
  failGenerationAttempt: "m1_fail_generation_attempt",
  failOutboxEvent: "m0_fail_outbox_event",
  heartbeat: "m0_heartbeat_worker",
  recordCheckRun: "m1_record_check_run",
} as const);

export interface CreateAudioBriefArguments {
  readonly organizationId: Uuid;
  readonly title: string;
  readonly payload: JsonValue;
  readonly correlationId: Uuid;
}

export interface RequestGenerationArguments {
  readonly organizationId: Uuid;
  readonly briefId: Uuid;
  readonly promptKey: string;
  readonly promptVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId: Uuid;
}

export interface CreateManualVersionArguments {
  readonly organizationId: Uuid;
  readonly contentItemId: Uuid;
  readonly briefId: Uuid;
  readonly payload: JsonValue;
  readonly supersedesVersionId: Uuid | null;
  readonly correlationId: Uuid;
}

export interface SubmitVersionArguments {
  readonly organizationId: Uuid;
  readonly contentVersionId: Uuid;
  readonly correlationId: Uuid;
}

export interface BrowserCommandArguments {
  readonly m1_create_audio_brief: CreateAudioBriefArguments;
  readonly m1_create_manual_version: CreateManualVersionArguments;
  readonly m1_request_generation: RequestGenerationArguments;
  readonly m1_submit_version: SubmitVersionArguments;
}

export interface CreateAudioBriefResult {
  readonly contentItemId: Uuid;
  readonly briefId: Uuid;
}

export interface BrowserCommandResults {
  readonly m1_create_audio_brief: CreateAudioBriefResult;
  readonly m1_create_manual_version: Uuid;
  readonly m1_request_generation: Uuid;
  readonly m1_submit_version: undefined;
}

export type BrowserCommandName = keyof BrowserCommandArguments;
export type BrowserCommandResult<Name extends BrowserCommandName> = BrowserCommandResults[Name];

export interface TenantBriefSummary {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly contentItemId: Uuid;
  readonly schemaId: "strongr.audio_reflection_brief.v1";
  readonly payloadHash: string;
  readonly createdAt: string;
}

export interface TenantReadGateway {
  listBriefs(organizationId: Uuid): Promise<readonly TenantBriefSummary[]>;
}

export interface ContentGenerationRequestedV1 {
  readonly eventId: Uuid;
  readonly organizationId: Uuid;
  readonly eventType: "content.generation_requested.v1";
  readonly eventVersion: 1;
  readonly aggregateType: "generation_job";
  readonly aggregateId: Uuid;
  readonly payload: {
    readonly job_id: Uuid;
  };
  readonly correlationId: Uuid;
  readonly attemptNumber: number;
  readonly leaseToken: Uuid;
  readonly leaseExpiresAt: string;
}
