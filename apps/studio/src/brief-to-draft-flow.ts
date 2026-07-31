import type {
  AudioReflection,
  AudioReflectionBrief,
  StrongrDailyAudioReflectionV2Brief,
} from "../../../packages/content-schemas/src/index.ts";
import {
  parseAudioReflection,
  parseAudioReflectionBrief,
  parseStrongrDailyAudioReflectionV2Brief,
} from "../../../packages/content-schemas/src/index.ts";
import type {
  CreateAudioBriefResult,
  TenantBriefSummary,
  TenantContentVersionSummary,
  TenantGenerationJobSummary,
  Uuid,
} from "../../../packages/contracts/src/index.ts";

import {
  isStudioGenerationSafeErrorCode,
  type StartGenerationResult,
  type StudioFoundation,
  type StudioGenerationSafeErrorCode,
} from "./foundation.ts";

export interface BriefToDraftWorkspace {
  readonly briefs: readonly TenantBriefSummary[];
  readonly generationJobs: readonly TenantGenerationJobSummary[];
  readonly versions: readonly TenantContentVersionSummary[];
}

export interface CreateBriefAndRequestInput {
  readonly organizationId: Uuid;
  readonly title: string;
  readonly brief: GovernedBrief;
  readonly promptKey: string;
  readonly promptVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId: Uuid;
}

export interface CreateBriefInput {
  readonly organizationId: Uuid;
  readonly title: string;
  readonly brief: GovernedBrief;
  readonly correlationId: Uuid;
}

export interface RequestGenerationInput {
  readonly organizationId: Uuid;
  readonly briefId: Uuid;
  readonly promptKey: string;
  readonly promptVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId: Uuid;
}

export type GovernedBrief = AudioReflectionBrief | StrongrDailyAudioReflectionV2Brief;

export interface CreateBriefAndRequestResult extends CreateAudioBriefResult {
  readonly generationJobId: Uuid;
}

export class GenerationRequestDeferredError extends Error {
  readonly briefId: Uuid;
  readonly contentItemId: Uuid;

  constructor(brief: CreateAudioBriefResult) {
    super("Generation request failed after the brief was created");
    this.name = "GenerationRequestDeferredError";
    this.briefId = brief.briefId;
    this.contentItemId = brief.contentItemId;
  }
}

export class GenerationRuntimeDeferredError extends Error {
  readonly errorCode: StudioGenerationSafeErrorCode | null;
  readonly generationJobId: Uuid;

  constructor(generationJobId: Uuid, errorCode: StudioGenerationSafeErrorCode | null = null) {
    super("Generation was requested but the private runtime did not confirm completion");
    this.name = "GenerationRuntimeDeferredError";
    this.errorCode = errorCode;
    this.generationJobId = generationJobId;
  }
}

function safeRuntimeErrorCode(error: unknown): StudioGenerationSafeErrorCode | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  return isStudioGenerationSafeErrorCode(error.code) ? error.code : null;
}

function requireUuid(value: string, name: string): Uuid {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function requireTitle(value: string): string {
  const title = value.trim();
  if (title.length < 1 || title.length > 200) {
    throw new Error("title is invalid");
  }
  return title;
}

function requirePromptKey(value: string): string {
  if (!/^[a-z][a-z0-9_.-]*$/.test(value)) {
    throw new Error("prompt key is invalid");
  }
  return value;
}

function requirePromptVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("prompt version is invalid");
  }
  return value;
}

function requireIdempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length < 8 || key.length > 255) {
    throw new Error("idempotency key is invalid");
  }
  return key;
}

function parseGovernedBrief(value: unknown): GovernedBrief {
  if (typeof value === "object" && value !== null && "schema_id" in value) {
    if (value.schema_id === "strongr.strongr_daily_audio_reflection_brief.v2") {
      return parseStrongrDailyAudioReflectionV2Brief(value);
    }
  }
  return parseAudioReflectionBrief(value);
}

export class BriefToDraftOperatorFlow {
  readonly #foundation: StudioFoundation;

  constructor(foundation: StudioFoundation) {
    this.#foundation = foundation;
  }

  async loadWorkspace(organizationId: Uuid, limit = 50): Promise<BriefToDraftWorkspace> {
    requireUuid(organizationId, "organization id");
    const [briefs, generationJobs, versions] = await Promise.all([
      this.#foundation.reads.listBriefs(organizationId, limit),
      this.#foundation.reads.listGenerationJobs(organizationId, limit),
      this.#foundation.reads.listContentVersions(organizationId, limit),
    ]);
    return Object.freeze({ briefs, generationJobs, versions });
  }

  async createBriefAndRequestGeneration(
    input: CreateBriefAndRequestInput,
  ): Promise<CreateBriefAndRequestResult> {
    requireIdempotencyKey(input.idempotencyKey);
    requirePromptKey(input.promptKey);
    requirePromptVersion(input.promptVersion);
    const brief = await this.createBrief(input);

    try {
      const generation = await this.requestGeneration({
        briefId: brief.briefId,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        organizationId: input.organizationId,
        promptKey: input.promptKey,
        promptVersion: input.promptVersion,
      });
      return Object.freeze({ ...brief, generationJobId: generation.generationJobId });
    } catch (error) {
      if (error instanceof GenerationRuntimeDeferredError) {
        throw error;
      }
      throw new GenerationRequestDeferredError(brief);
    }
  }

  async createBrief(input: CreateBriefInput): Promise<CreateAudioBriefResult> {
    const organizationId = requireUuid(input.organizationId, "organization id");
    const correlationId = requireUuid(input.correlationId, "correlation id");
    const briefPayload = parseGovernedBrief(input.brief);
    const title = requireTitle(input.title);
    return this.#foundation.commands.invoke("m1_create_audio_brief", {
      correlationId,
      organizationId,
      payload: briefPayload,
      title,
    });
  }

  async requestGeneration(input: RequestGenerationInput): Promise<StartGenerationResult> {
    const organizationId = requireUuid(input.organizationId, "organization id");
    const briefId = requireUuid(input.briefId, "brief id");
    const correlationId = requireUuid(input.correlationId, "correlation id");
    const generationJobId = await this.#foundation.commands.invoke("m1_request_generation", {
      briefId,
      correlationId,
      idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
      organizationId,
      promptKey: requirePromptKey(input.promptKey),
      promptVersion: requirePromptVersion(input.promptVersion),
    });
    if (!this.#foundation.generation) {
      throw new GenerationRuntimeDeferredError(generationJobId);
    }
    try {
      return await this.#foundation.generation.startGeneration({
        generationJobId,
      });
    } catch (error) {
      throw new GenerationRuntimeDeferredError(generationJobId, safeRuntimeErrorCode(error));
    }
  }

  async createManualDraft(input: {
    readonly organizationId: Uuid;
    readonly contentItemId: Uuid;
    readonly briefId: Uuid;
    readonly payload: AudioReflection;
    readonly supersedesVersionId: Uuid | null;
    readonly correlationId: Uuid;
  }): Promise<Uuid> {
    return this.#foundation.commands.invoke("m1_create_manual_version", {
      briefId: requireUuid(input.briefId, "brief id"),
      contentItemId: requireUuid(input.contentItemId, "content item id"),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      organizationId: requireUuid(input.organizationId, "organization id"),
      payload: parseAudioReflection(input.payload),
      supersedesVersionId:
        input.supersedesVersionId === null
          ? null
          : requireUuid(input.supersedesVersionId, "superseded version id"),
    });
  }

  async submitDraft(input: {
    readonly organizationId: Uuid;
    readonly contentVersionId: Uuid;
    readonly correlationId: Uuid;
  }): Promise<void> {
    await this.#foundation.commands.invoke("m1_submit_version", {
      contentVersionId: requireUuid(input.contentVersionId, "content version id"),
      correlationId: requireUuid(input.correlationId, "correlation id"),
      organizationId: requireUuid(input.organizationId, "organization id"),
    });
  }
}

export function createBriefToDraftOperatorFlow(
  foundation: StudioFoundation,
): BriefToDraftOperatorFlow {
  return new BriefToDraftOperatorFlow(foundation);
}
