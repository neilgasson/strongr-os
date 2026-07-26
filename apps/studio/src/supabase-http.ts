import type {
  BrowserCommandArguments,
  BrowserCommandName,
  BrowserCommandResult,
  ContentVersionSource,
  ContentVersionState,
  GenerationJobState,
  JsonValue,
  TenantBriefSummary,
  TenantContentVersionSummary,
  TenantGenerationJobSummary,
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

  async #readRows(
    table: string,
    select: string,
    organizationId: Uuid,
    limit: number,
  ): Promise<readonly unknown[]> {
    const parameters = new URLSearchParams({
      limit: String(requireLimit(limit)),
      order: "created_at.desc,id.desc",
      organization_id: `eq.${organizationId}`,
      select,
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
