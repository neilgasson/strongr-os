import type {
  GenerationAdapterIdentity,
  GenerationResult,
} from "../../../packages/ai/src/index.ts";
import {
  type JsonValue,
  type Uuid,
  workerCommands,
} from "../../../packages/contracts/src/index.ts";

import type {
  DeliveryFailureState,
  GenerationAttemptDisposition,
  GenerationAttemptLease,
  GenerationCompletion,
  GenerationEventClaim,
  GenerationFailureState,
  GenerationWorkerStore,
} from "./durable-worker.ts";
import type { SupabaseRpcClient } from "./supabase-rpc.ts";

type UnknownRecord = Readonly<Record<string, unknown>>;

function requireRecord(value: unknown, name: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${name} RPC result`);
  }
  return value as UnknownRecord;
}

function requireString(record: UnknownRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid RPC field: ${key}`);
  }
  return value;
}

function requireNullableString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid RPC field: ${key}`);
  }
  return value;
}

function requireInteger(record: UnknownRecord, key: string): number {
  const value = record[key];
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid RPC field: ${key}`);
  }
  return value as number;
}

function requireSingleRow(value: unknown, name: string): UnknownRecord {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error(`Invalid ${name} RPC row count`);
  }
  return requireRecord(value[0], name);
}

function requireUuid(record: UnknownRecord, key: string): Uuid {
  const value = requireString(record, key);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`Invalid RPC field: ${key}`);
  }
  return value;
}

function requireNullableUuid(record: UnknownRecord, key: string): Uuid | null {
  const value = requireNullableString(record, key);
  if (value === null) {
    return null;
  }
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`Invalid RPC field: ${key}`);
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
  throw new Error(`Invalid RPC field: ${key}`);
}

function parseClaim(value: unknown): GenerationEventClaim {
  const record = requireRecord(value, "generation claim");
  if (
    requireString(record, "event_type") !== "content.generation_requested.v1" ||
    requireInteger(record, "event_version") !== 1 ||
    requireString(record, "aggregate_type") !== "generation_job"
  ) {
    throw new Error("Invalid generation event contract");
  }
  return Object.freeze({
    aggregateType: "generation_job",
    attemptNumber: requireInteger(record, "attempt_number"),
    causationId: requireNullableUuid(record, "causation_id"),
    correlationId: requireUuid(record, "correlation_id"),
    eventId: requireUuid(record, "event_id"),
    eventType: "content.generation_requested.v1",
    eventVersion: 1,
    generationJobId: requireUuid(record, "aggregate_id"),
    leaseExpiresAt: requireString(record, "lease_expires_at"),
    leaseToken: requireUuid(record, "lease_token"),
    organizationId: requireUuid(record, "organization_id"),
    payload: requireJsonValue(record.payload, "payload"),
  });
}

function parseAttemptLease(value: unknown): GenerationAttemptLease {
  const record = requireSingleRow(value, "begin generation attempt");
  const disposition = requireString(record, "disposition");
  if (!["ready", "already_succeeded", "cancelled", "dead_letter"].includes(disposition)) {
    throw new Error("Invalid generation attempt disposition");
  }
  const promptChecksum = requireString(record, "prompt_checksum");
  if (!/^[a-f0-9]{64}$/.test(promptChecksum)) {
    throw new Error("Invalid RPC field: prompt_checksum");
  }
  return Object.freeze({
    attemptId: requireNullableUuid(record, "attempt_id"),
    attemptNumber: requireInteger(record, "attempt_number"),
    brief: record.brief,
    correlationId: requireUuid(record, "correlation_id"),
    disposition: disposition as GenerationAttemptDisposition,
    generationJobId: requireUuid(record, "generation_job_id"),
    maxAttempts: requireInteger(record, "max_attempts"),
    organizationId: requireUuid(record, "organization_id"),
    promptChecksum,
    promptKey: requireString(record, "prompt_key"),
    promptVersion: requireInteger(record, "prompt_version"),
  });
}

function requireScalar<Result extends string>(
  value: unknown,
  allowed: readonly Result[],
  name: string,
): Result {
  if (typeof value !== "string" || !allowed.includes(value as Result)) {
    throw new Error(`Invalid ${name} RPC result`);
  }
  return value as Result;
}

export class SupabaseGenerationWorkerStore implements GenerationWorkerStore {
  readonly #rpc: SupabaseRpcClient;

  constructor(rpc: SupabaseRpcClient) {
    this.#rpc = rpc;
  }

  async claimGenerationEvents(
    workerId: string,
    batchSize: number,
    leaseSeconds: number,
  ): Promise<readonly GenerationEventClaim[]> {
    const rows = await this.#rpc.rpc<unknown>(workerCommands.claimGenerationEvents, {
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
      p_worker_id: workerId,
    });
    if (!Array.isArray(rows)) {
      throw new Error("Invalid generation claim RPC result");
    }
    return Object.freeze(rows.map((row) => parseClaim(row)));
  }

  async beginGenerationAttempt(
    claim: GenerationEventClaim,
    workerId: string,
    identity: GenerationAdapterIdentity,
  ): Promise<GenerationAttemptLease> {
    const result = await this.#rpc.rpc<unknown>(workerCommands.beginGenerationAttempt, {
      p_event_id: claim.eventId,
      p_lease_token: claim.leaseToken,
      p_model: identity.model,
      p_provider: identity.provider,
      p_worker_id: workerId,
    });
    return parseAttemptLease(result);
  }

  async completeGenerationAttempt(
    claim: GenerationEventClaim,
    workerId: string,
    attemptId: Uuid,
    result: GenerationResult,
    latencyMs: number,
  ): Promise<GenerationCompletion> {
    const value = await this.#rpc.rpc<unknown>(workerCommands.completeGenerationAttempt, {
      p_attempt_id: attemptId,
      p_event_id: claim.eventId,
      p_latency_ms: latencyMs,
      p_lease_token: claim.leaseToken,
      p_output: result.output,
      p_output_hash: result.outputHash,
      p_provider_response_id: result.providerResponseId,
      p_response_schema_id: result.responseSchemaId,
      p_worker_id: workerId,
    });
    const completion = requireSingleRow(value, "complete generation attempt");
    if (requireString(completion, "completion_state") !== "succeeded") {
      throw new Error("Invalid complete generation attempt RPC result");
    }
    return Object.freeze({
      completionState: "succeeded",
      contentVersionId: requireUuid(completion, "content_version_id"),
    });
  }

  async failGenerationAttempt(
    claim: GenerationEventClaim,
    workerId: string,
    attemptId: Uuid,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<GenerationFailureState> {
    const state = await this.#rpc.rpc<unknown>(workerCommands.failGenerationAttempt, {
      p_attempt_id: attemptId,
      p_error_code: errorCode,
      p_event_id: claim.eventId,
      p_lease_token: claim.leaseToken,
      p_retry_after_seconds: retryAfterSeconds,
      p_worker_id: workerId,
    });
    return requireScalar(state, ["failed", "dead_letter"] as const, "fail generation attempt");
  }

  async failOutboxEvent(
    claim: GenerationEventClaim,
    workerId: string,
    errorCode: string,
    retryAfterSeconds: number,
    maxAttempts: number,
  ): Promise<DeliveryFailureState> {
    const state = await this.#rpc.rpc<unknown>(workerCommands.failOutboxEvent, {
      p_error_code: errorCode,
      p_event_id: claim.eventId,
      p_lease_token: claim.leaseToken,
      p_max_attempts: maxAttempts,
      p_retry_after_seconds: retryAfterSeconds,
      p_worker_id: workerId,
    });
    return requireScalar(
      state,
      ["failed", "dead_letter", "delivered"] as const,
      "fail outbox event",
    );
  }

  async acknowledgeOutboxEvent(
    claim: GenerationEventClaim,
    workerId: string,
    deliveryKey: string,
  ): Promise<Uuid> {
    const receipt = await this.#rpc.rpc<unknown>(workerCommands.acknowledgeOutboxEvent, {
      p_delivery_key: deliveryKey,
      p_event_id: claim.eventId,
      p_lease_token: claim.leaseToken,
      p_worker_id: workerId,
    });
    if (
      typeof receipt !== "string" ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(receipt)
    ) {
      throw new Error("Invalid acknowledge outbox event RPC result");
    }
    return receipt;
  }

  async heartbeat(
    workerId: string,
    status: "idle" | "working" | "degraded" | "stopped",
    metadata: Readonly<Record<string, JsonValue>>,
  ): Promise<void> {
    await this.#rpc.rpc<unknown>(workerCommands.heartbeat, {
      p_metadata: metadata,
      p_status: status,
      p_worker_id: workerId,
    });
  }
}
