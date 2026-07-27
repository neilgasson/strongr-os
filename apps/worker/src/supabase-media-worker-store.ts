import {
  type JsonValue,
  type Uuid,
  workerCommands,
} from "../../../packages/contracts/src/index.ts";
import type { MediaAdapterIdentity, ValidatedPcmWav } from "../../../packages/media/src/index.ts";

import type {
  MediaAttemptDisposition,
  MediaAttemptLease,
  MediaCompletion,
  MediaEventClaim,
  MediaReconciliationInput,
  MediaWorkerStore,
} from "./media-worker.ts";
import type { DeliveryFailureState, GenerationFailureState } from "./durable-worker.ts";
import type { SupabaseRpcClient } from "./supabase-rpc.ts";

type UnknownRecord = Readonly<Record<string, unknown>>;

function record(value: unknown, name: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${name} RPC result`);
  }
  return value as UnknownRecord;
}

function row(value: unknown, name: string): UnknownRecord {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error(`Invalid ${name} RPC row count`);
  }
  return record(value[0], name);
}

function string(value: UnknownRecord, key: string): string {
  const item = value[key];
  if (typeof item !== "string" || item.length === 0) {
    throw new Error(`Invalid RPC field: ${key}`);
  }
  return item;
}

function nullableString(value: UnknownRecord, key: string): string | null {
  const item = value[key];
  if (item === null) {
    return null;
  }
  return string(value, key);
}

function integer(value: UnknownRecord, key: string): number {
  const item = value[key];
  if (!Number.isInteger(item)) {
    throw new Error(`Invalid RPC field: ${key}`);
  }
  return item as number;
}

function nullableInteger(value: UnknownRecord, key: string): number | null {
  if (value[key] === null) {
    return null;
  }
  return integer(value, key);
}

function uuid(value: UnknownRecord, key: string): Uuid {
  const item = string(value, key);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(item)) {
    throw new Error(`Invalid RPC field: ${key}`);
  }
  return item;
}

function nullableUuid(value: UnknownRecord, key: string): Uuid | null {
  if (value[key] === null) {
    return null;
  }
  return uuid(value, key);
}

function json(value: unknown, key: string): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => json(item, key));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([name, item]) => [
        name,
        json(item, key),
      ]),
    );
  }
  throw new Error(`Invalid RPC field: ${key}`);
}

function uuidResult(value: unknown, name: string): Uuid {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error(`Invalid ${name} RPC result`);
  }
  return value;
}

function parseClaim(value: unknown): MediaEventClaim {
  const result = record(value, "claim media events");
  const eventType = string(result, "event_type");
  const aggregateType = string(result, "aggregate_type");
  const eventVersion = integer(result, "event_version");
  if (
    eventType !== "media.generation_requested.v1" ||
    aggregateType !== "media_job" ||
    eventVersion !== 1
  ) {
    throw new Error("Invalid media event claim identity");
  }
  return Object.freeze({
    aggregateType,
    attemptNumber: integer(result, "attempt_number"),
    causationId: nullableUuid(result, "causation_id"),
    correlationId: uuid(result, "correlation_id"),
    eventId: uuid(result, "event_id"),
    eventType,
    eventVersion,
    leaseExpiresAt: string(result, "lease_expires_at"),
    leaseToken: uuid(result, "lease_token"),
    mediaJobId: uuid(result, "aggregate_id"),
    organizationId: uuid(result, "organization_id"),
    payload: json(result.payload, "payload"),
  });
}

function parseDisposition(value: string): MediaAttemptDisposition {
  if (
    value === "ready" ||
    value === "already_succeeded" ||
    value === "cancelled" ||
    value === "dead_letter"
  ) {
    return value;
  }
  throw new Error("Invalid media attempt disposition");
}

function parseAttempt(value: unknown): MediaAttemptLease {
  const result = row(value, "begin media attempt");
  const bitsPerSample = integer(result, "bits_per_sample");
  const channels = integer(result, "channels");
  const codec = string(result, "codec");
  const container = string(result, "container");
  const mimeType = string(result, "mime_type");
  const sampleRateHz = integer(result, "sample_rate_hz");
  if (
    bitsPerSample !== 16 ||
    channels !== 1 ||
    codec !== "pcm_s16le" ||
    container !== "wav" ||
    mimeType !== "audio/wav" ||
    sampleRateHz !== 16_000
  ) {
    throw new Error("Invalid media output specification");
  }
  return Object.freeze({
    artifactId: uuid(result, "artifact_id"),
    attemptId: nullableUuid(result, "attempt_id"),
    attemptNumber: integer(result, "attempt_number"),
    correlationId: uuid(result, "correlation_id"),
    disposition: parseDisposition(string(result, "disposition")),
    existingByteCount: nullableInteger(result, "existing_byte_count"),
    existingSha256: nullableString(result, "existing_sha256"),
    inputHash: string(result, "input_hash"),
    maxAttempts: integer(result, "max_attempts"),
    mediaJobId: uuid(result, "media_job_id"),
    objectPath: string(result, "object_path"),
    organizationId: uuid(result, "organization_id"),
    outputSpec: Object.freeze({
      bitsPerSample,
      channels,
      codec,
      container,
      maxBytes: integer(result, "max_bytes"),
      maxDurationMs: integer(result, "max_duration_ms"),
      mimeType,
      sampleRateHz,
    }),
    outputSpecId: uuid(result, "output_spec_id"),
    productionPackageId: uuid(result, "production_package_id"),
  });
}

export class SupabaseMediaWorkerStore implements MediaWorkerStore {
  readonly #rpc: SupabaseRpcClient;

  constructor(rpc: SupabaseRpcClient) {
    this.#rpc = rpc;
  }

  async claimMediaEvents(
    workerId: string,
    batchSize: number,
    leaseSeconds: number,
  ): Promise<readonly MediaEventClaim[]> {
    const result = await this.#rpc.rpc<unknown>(workerCommands.claimMediaEvents, {
      p_batch_size: batchSize,
      p_lease_seconds: leaseSeconds,
      p_worker_id: workerId,
    });
    if (!Array.isArray(result)) {
      throw new Error("Invalid claim media events RPC result");
    }
    return Object.freeze(result.map(parseClaim));
  }

  async beginMediaAttempt(
    claim: MediaEventClaim,
    workerId: string,
    identity: MediaAdapterIdentity,
  ): Promise<MediaAttemptLease> {
    return parseAttempt(
      await this.#rpc.rpc<unknown>(workerCommands.beginMediaAttempt, {
        p_adapter_key: identity.adapterKey,
        p_adapter_version: identity.adapterVersion,
        p_event_id: claim.eventId,
        p_lease_token: claim.leaseToken,
        p_worker_id: workerId,
      }),
    );
  }

  async completeMediaAttempt(
    claim: MediaEventClaim,
    workerId: string,
    attempt: MediaAttemptLease,
    validation: ValidatedPcmWav,
    storageEtag: string | null,
    providerNeutralCorrelationId: string,
    latencyMs: number,
    costMicrounits: number,
  ): Promise<MediaCompletion> {
    const artifactId = uuidResult(
      await this.#rpc.rpc<unknown>(workerCommands.completeMediaAttempt, {
        p_attempt_id: attempt.attemptId,
        p_bits_per_sample: validation.bitsPerSample,
        p_byte_count: validation.byteCount,
        p_channels: validation.channels,
        p_codec: validation.codec,
        p_container: validation.container,
        p_cost_microunits: costMicrounits,
        p_duration_ms: validation.durationMs,
        p_event_id: claim.eventId,
        p_latency_ms: latencyMs,
        p_lease_token: claim.leaseToken,
        p_mime_type: validation.mimeType,
        p_provider_correlation_id: providerNeutralCorrelationId,
        p_sample_rate_hz: validation.sampleRateHz,
        p_sha256: validation.sha256,
        p_storage_etag: storageEtag,
        p_validation_schema_id: validation.validationSchemaId,
        p_worker_id: workerId,
      }),
      "complete media attempt",
    );
    return Object.freeze({ artifactId, completionState: "succeeded" });
  }

  async failMediaAttempt(
    claim: MediaEventClaim,
    workerId: string,
    attemptId: Uuid,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<GenerationFailureState> {
    const result = await this.#rpc.rpc<unknown>(workerCommands.failMediaAttempt, {
      p_attempt_id: attemptId,
      p_error_code: errorCode,
      p_event_id: claim.eventId,
      p_lease_token: claim.leaseToken,
      p_retry_after_seconds: retryAfterSeconds,
      p_worker_id: workerId,
    });
    if (result !== "failed" && result !== "dead_letter") {
      throw new Error("Invalid fail media attempt RPC result");
    }
    return result;
  }

  async recordReconciliation(
    claim: MediaEventClaim,
    workerId: string,
    input: MediaReconciliationInput,
  ): Promise<Uuid> {
    return uuidResult(
      await this.#rpc.rpc<unknown>(workerCommands.recordMediaReconciliation, {
        p_detail_code: input.detailCode,
        p_event_id: claim.eventId,
        p_event_type: input.eventType,
        p_lease_token: claim.leaseToken,
        p_media_artifact_id: input.mediaArtifactId,
        p_object_path: input.objectPath,
        p_observed_sha256: input.observedSha256,
        p_outcome: input.outcome,
        p_worker_id: workerId,
      }),
      "record media reconciliation",
    );
  }

  async failOutboxEvent(
    claim: MediaEventClaim,
    workerId: string,
    errorCode: string,
    retryAfterSeconds: number,
    maxAttempts: number,
  ): Promise<DeliveryFailureState> {
    const result = await this.#rpc.rpc<unknown>(workerCommands.failOutboxEvent, {
      p_error_code: errorCode,
      p_event_id: claim.eventId,
      p_lease_token: claim.leaseToken,
      p_max_attempts: maxAttempts,
      p_retry_after_seconds: retryAfterSeconds,
      p_worker_id: workerId,
    });
    if (result !== "failed" && result !== "dead_letter" && result !== "delivered") {
      throw new Error("Invalid fail outbox event RPC result");
    }
    return result;
  }

  async acknowledgeOutboxEvent(
    claim: MediaEventClaim,
    workerId: string,
    deliveryKey: string,
  ): Promise<Uuid> {
    return uuidResult(
      await this.#rpc.rpc<unknown>(workerCommands.acknowledgeOutboxEvent, {
        p_delivery_key: deliveryKey,
        p_event_id: claim.eventId,
        p_lease_token: claim.leaseToken,
        p_worker_id: workerId,
      }),
      "acknowledge outbox event",
    );
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
