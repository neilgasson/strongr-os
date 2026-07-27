import type {
  MediaAdapter,
  MediaAdapterIdentity,
  PcmWavOutputSpec,
  ValidatedPcmWav,
} from "../../../packages/media/src/index.ts";
import { MediaValidationError, validatePcmWav } from "../../../packages/media/src/index.ts";
import type { JsonValue, Uuid } from "../../../packages/contracts/src/index.ts";

import type { DeliveryFailureState, GenerationFailureState } from "./durable-worker.ts";
import type { PrivateMediaStorage, StorageDownloadResult } from "./supabase-storage.ts";
import { SupabaseStorageError } from "./supabase-storage.ts";

export interface MediaEventClaim {
  readonly eventId: Uuid;
  readonly organizationId: Uuid;
  readonly eventType: "media.generation_requested.v1";
  readonly eventVersion: 1;
  readonly aggregateType: "media_job";
  readonly mediaJobId: Uuid;
  readonly payload: JsonValue;
  readonly correlationId: Uuid;
  readonly causationId: Uuid | null;
  readonly attemptNumber: number;
  readonly leaseToken: Uuid;
  readonly leaseExpiresAt: string;
}

export type MediaAttemptDisposition = "ready" | "already_succeeded" | "cancelled" | "dead_letter";

export interface MediaAttemptLease {
  readonly disposition: MediaAttemptDisposition;
  readonly organizationId: Uuid;
  readonly mediaJobId: Uuid;
  readonly productionPackageId: Uuid;
  readonly outputSpecId: Uuid;
  readonly inputHash: string;
  readonly correlationId: Uuid;
  readonly attemptId: Uuid | null;
  readonly artifactId: Uuid;
  readonly objectPath: string;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly outputSpec: PcmWavOutputSpec;
  readonly existingSha256: string | null;
  readonly existingByteCount: number | null;
}

export interface MediaCompletion {
  readonly artifactId: Uuid;
  readonly completionState: "succeeded";
}

export interface MediaReconciliationInput {
  readonly mediaArtifactId: Uuid | null;
  readonly eventType:
    | "upload_ambiguous"
    | "object_missing"
    | "object_orphaned"
    | "checksum_mismatch"
    | "reconciled";
  readonly outcome: "detected" | "verified" | "blocked";
  readonly objectPath: string;
  readonly observedSha256: string | null;
  readonly detailCode: string;
}

export interface MediaWorkerStore {
  claimMediaEvents(
    workerId: string,
    batchSize: number,
    leaseSeconds: number,
  ): Promise<readonly MediaEventClaim[]>;
  beginMediaAttempt(
    claim: MediaEventClaim,
    workerId: string,
    identity: MediaAdapterIdentity,
  ): Promise<MediaAttemptLease>;
  completeMediaAttempt(
    claim: MediaEventClaim,
    workerId: string,
    attempt: MediaAttemptLease,
    validation: ValidatedPcmWav,
    storageEtag: string | null,
    providerNeutralCorrelationId: string,
    latencyMs: number,
    costMicrounits: number,
  ): Promise<MediaCompletion>;
  failMediaAttempt(
    claim: MediaEventClaim,
    workerId: string,
    attemptId: Uuid,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<GenerationFailureState>;
  recordReconciliation(
    claim: MediaEventClaim,
    workerId: string,
    input: MediaReconciliationInput,
  ): Promise<Uuid>;
  failOutboxEvent(
    claim: MediaEventClaim,
    workerId: string,
    errorCode: string,
    retryAfterSeconds: number,
    maxAttempts: number,
  ): Promise<DeliveryFailureState>;
  acknowledgeOutboxEvent(
    claim: MediaEventClaim,
    workerId: string,
    deliveryKey: string,
  ): Promise<Uuid>;
  heartbeat(
    workerId: string,
    status: "idle" | "working" | "degraded" | "stopped",
    metadata: Readonly<Record<string, JsonValue>>,
  ): Promise<void>;
}

export interface MediaWorkerEvidenceRecord {
  readonly check: "m2_1_durable_media_worker";
  readonly action: string;
  readonly status: "pass" | "retry" | "dead_letter" | "deferred" | "cancelled";
  readonly worker_id: string;
  readonly event_id?: Uuid;
  readonly media_job_id?: Uuid;
  readonly attempt_number?: number;
  readonly artifact_id?: Uuid;
  readonly error_code?: string;
}

export interface MediaWorkerEvidenceSink {
  record(record: MediaWorkerEvidenceRecord): void;
}

export interface DurableMediaWorkerSummary {
  readonly claimed: number;
  readonly succeeded: number;
  readonly replayed: number;
  readonly retried: number;
  readonly deadLettered: number;
  readonly cancelled: number;
  readonly deferred: number;
  readonly reconciled: number;
}

type MediaOutcome =
  | "succeeded"
  | "replayed"
  | "retried"
  | "dead_letter"
  | "cancelled"
  | "deferred"
  | "reconciled";

const noopEvidence: MediaWorkerEvidenceSink = Object.freeze({
  record(): void {},
});

function deliveryKey(eventId: Uuid): string {
  return `media-${eventId}`;
}

function requireInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function requireProviderNeutralCorrelationId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(value)) {
    throw new Error("provider-neutral correlation id is invalid");
  }
  return value;
}

function sameBytes(
  download: StorageDownloadResult,
  validation: ValidatedPcmWav,
): download is Extract<StorageDownloadResult, { disposition: "found" }> {
  if (download.disposition !== "found") {
    return false;
  }
  try {
    const observed = validatePcmWav(download.bytes, {
      bitsPerSample: validation.bitsPerSample,
      channels: validation.channels,
      codec: validation.codec,
      container: validation.container,
      maxBytes: validation.byteCount,
      maxDurationMs: validation.durationMs,
      mimeType: validation.mimeType,
      sampleRateHz: validation.sampleRateHz,
    });
    return observed.sha256 === validation.sha256 && observed.byteCount === validation.byteCount;
  } catch {
    return false;
  }
}

export class DurableMediaWorker {
  readonly #adapter: MediaAdapter;
  readonly #clock: () => number;
  readonly #evidence: MediaWorkerEvidenceSink;
  readonly #storage: PrivateMediaStorage;
  readonly #store: MediaWorkerStore;
  readonly #workerId: string;

  constructor(input: {
    readonly adapter: MediaAdapter;
    readonly clock?: () => number;
    readonly evidence?: MediaWorkerEvidenceSink;
    readonly storage: PrivateMediaStorage;
    readonly store: MediaWorkerStore;
    readonly workerId: string;
  }) {
    this.#adapter = input.adapter;
    this.#clock = input.clock ?? (() => performance.now());
    this.#evidence = input.evidence ?? noopEvidence;
    this.#storage = input.storage;
    this.#store = input.store;
    this.#workerId = input.workerId;
  }

  async runOnce(
    options: {
      readonly batchSize?: number;
      readonly leaseSeconds?: number;
      readonly retryAfterSeconds?: number;
    } = {},
  ): Promise<DurableMediaWorkerSummary> {
    const batchSize = requireInteger(options.batchSize ?? 10, 1, 100, "batch size");
    const leaseSeconds = requireInteger(options.leaseSeconds ?? 120, 1, 3_600, "lease duration");
    const retryAfterSeconds = requireInteger(
      options.retryAfterSeconds ?? 30,
      0,
      86_400,
      "retry delay",
    );
    const claims = await this.#store.claimMediaEvents(this.#workerId, batchSize, leaseSeconds);
    const outcomes: MediaOutcome[] = [];
    for (const claim of claims) {
      outcomes.push(await this.#process(claim, retryAfterSeconds));
    }
    const summary = Object.freeze({
      cancelled: outcomes.filter((value) => value === "cancelled").length,
      claimed: claims.length,
      deadLettered: outcomes.filter((value) => value === "dead_letter").length,
      deferred: outcomes.filter((value) => value === "deferred").length,
      reconciled: outcomes.filter((value) => value === "reconciled").length,
      replayed: outcomes.filter((value) => value === "replayed").length,
      retried: outcomes.filter((value) => value === "retried").length,
      succeeded: outcomes.filter((value) => value === "succeeded").length,
    });
    const degraded = summary.deadLettered > 0 || summary.deferred > 0;
    await this.#store.heartbeat(this.#workerId, degraded ? "degraded" : "idle", {
      claimed: summary.claimed,
      dead_lettered: summary.deadLettered,
      deferred: summary.deferred,
      reconciled: summary.reconciled,
      retried: summary.retried,
      succeeded: summary.succeeded,
    });
    return summary;
  }

  async #process(claim: MediaEventClaim, retryAfterSeconds: number): Promise<MediaOutcome> {
    let attempt: MediaAttemptLease;
    try {
      attempt = await this.#store.beginMediaAttempt(claim, this.#workerId, this.#adapter.identity);
    } catch {
      this.#record("attempt_begin_deferred", "deferred", claim, undefined, "database.begin_failed");
      return "deferred";
    }

    if (attempt.disposition === "cancelled") {
      return this.#acknowledge(claim, attempt, "cancelled");
    }
    if (attempt.disposition === "dead_letter") {
      return this.#failTerminal(claim, attempt, retryAfterSeconds);
    }
    if (attempt.disposition === "already_succeeded") {
      return this.#verifyCompleted(claim, attempt);
    }
    if (!attempt.attemptId) {
      this.#record("attempt_missing", "deferred", claim, attempt, "database.attempt_id_missing");
      return "deferred";
    }

    const startedAt = this.#clock();
    let bytes: Uint8Array;
    let providerNeutralCorrelationId: string;
    let costMicrounits: number;
    try {
      const result = await this.#adapter.generate({
        correlationId: attempt.correlationId,
        inputHash: attempt.inputHash,
        mediaJobId: attempt.mediaJobId,
        organizationId: attempt.organizationId,
        outputSpecId: attempt.outputSpecId,
        productionPackageId: attempt.productionPackageId,
      });
      bytes = result.bytes;
      providerNeutralCorrelationId = requireProviderNeutralCorrelationId(
        result.providerNeutralCorrelationId,
      );
      costMicrounits = requireInteger(result.costMicrounits, 0, Number.MAX_SAFE_INTEGER, "cost");
    } catch {
      return this.#failCurrent(claim, attempt, "media.adapter_failed", retryAfterSeconds);
    }

    let validation: ValidatedPcmWav;
    try {
      validation = validatePcmWav(bytes, attempt.outputSpec);
    } catch (error) {
      return this.#failCurrent(
        claim,
        attempt,
        error instanceof MediaValidationError ? error.code : "media.validation_failed",
        retryAfterSeconds,
      );
    }

    try {
      const upload = await this.#storage.uploadWriteOnce(
        "strongr-os-media",
        attempt.objectPath,
        bytes,
        "audio/wav",
      );
      if (upload.disposition === "conflict") {
        return await this.#reconcileExisting(
          claim,
          attempt,
          validation,
          providerNeutralCorrelationId,
          Math.max(0, Math.round(this.#clock() - startedAt)),
          costMicrounits,
        );
      }
      return await this.#complete(
        claim,
        attempt,
        validation,
        upload.etag,
        providerNeutralCorrelationId,
        Math.max(0, Math.round(this.#clock() - startedAt)),
        costMicrounits,
        "succeeded",
      );
    } catch (error) {
      if (error instanceof SupabaseStorageError && error.code === "upload_rejected") {
        return this.#failCurrent(claim, attempt, "storage.upload_rejected", retryAfterSeconds);
      }
      this.#record("upload_ambiguous", "deferred", claim, attempt, "storage.upload_ambiguous");
      try {
        await this.#store.recordReconciliation(claim, this.#workerId, {
          detailCode: "storage_upload_response_ambiguous",
          eventType: "upload_ambiguous",
          mediaArtifactId: null,
          objectPath: attempt.objectPath,
          observedSha256: null,
          outcome: "detected",
        });
      } catch {
        // The unacknowledged lease remains the recovery authority.
      }
      return "deferred";
    }
  }

  async #reconcileExisting(
    claim: MediaEventClaim,
    attempt: MediaAttemptLease,
    validation: ValidatedPcmWav,
    providerNeutralCorrelationId: string,
    latencyMs: number,
    costMicrounits: number,
  ): Promise<MediaOutcome> {
    let download: StorageDownloadResult;
    try {
      download = await this.#storage.download("strongr-os-media", attempt.objectPath);
    } catch {
      this.#record(
        "existing_object_verification_deferred",
        "deferred",
        claim,
        attempt,
        "storage.download_failed",
      );
      return "deferred";
    }
    if (download.disposition === "not_found") {
      await this.#safeReconciliation(claim, {
        detailCode: "storage_conflict_without_readable_object",
        eventType: "object_missing",
        mediaArtifactId: null,
        objectPath: attempt.objectPath,
        observedSha256: null,
        outcome: "blocked",
      });
      return this.#failCurrent(claim, attempt, "storage.conflict_without_object", 30);
    }
    let observed: ValidatedPcmWav | null = null;
    try {
      observed = validatePcmWav(download.bytes, attempt.outputSpec);
    } catch {
      observed = null;
    }
    if (!observed || !sameBytes(download, validation)) {
      await this.#safeReconciliation(claim, {
        detailCode: "write_once_object_checksum_mismatch",
        eventType: "checksum_mismatch",
        mediaArtifactId: null,
        objectPath: attempt.objectPath,
        observedSha256: observed?.sha256 ?? null,
        outcome: "blocked",
      });
      return this.#failCurrent(claim, attempt, "storage.checksum_mismatch", 30);
    }
    await this.#safeReconciliation(claim, {
      detailCode: "write_once_existing_object_verified",
      eventType: "reconciled",
      mediaArtifactId: null,
      objectPath: attempt.objectPath,
      observedSha256: observed.sha256,
      outcome: "verified",
    });
    return this.#complete(
      claim,
      attempt,
      observed,
      download.etag,
      providerNeutralCorrelationId,
      latencyMs,
      costMicrounits,
      "reconciled",
    );
  }

  async #verifyCompleted(
    claim: MediaEventClaim,
    attempt: MediaAttemptLease,
  ): Promise<MediaOutcome> {
    let download: StorageDownloadResult;
    try {
      download = await this.#storage.download("strongr-os-media", attempt.objectPath);
    } catch {
      this.#record(
        "completed_object_verification_deferred",
        "deferred",
        claim,
        attempt,
        "storage.download_failed",
      );
      return "deferred";
    }
    if (download.disposition === "not_found") {
      await this.#safeReconciliation(claim, {
        detailCode: "canonical_artifact_object_missing",
        eventType: "object_missing",
        mediaArtifactId: attempt.artifactId,
        objectPath: attempt.objectPath,
        observedSha256: null,
        outcome: "blocked",
      });
      return "deferred";
    }
    let validation: ValidatedPcmWav | null = null;
    try {
      validation = validatePcmWav(download.bytes, attempt.outputSpec);
    } catch {
      validation = null;
    }
    if (
      !validation ||
      validation.sha256 !== attempt.existingSha256 ||
      validation.byteCount !== attempt.existingByteCount
    ) {
      await this.#safeReconciliation(claim, {
        detailCode: "canonical_artifact_checksum_mismatch",
        eventType: "checksum_mismatch",
        mediaArtifactId: attempt.artifactId,
        objectPath: attempt.objectPath,
        observedSha256: validation?.sha256 ?? null,
        outcome: "blocked",
      });
      return "deferred";
    }
    return this.#acknowledge(claim, attempt, "replayed");
  }

  async #complete(
    claim: MediaEventClaim,
    attempt: MediaAttemptLease,
    validation: ValidatedPcmWav,
    etag: string | null,
    providerNeutralCorrelationId: string,
    latencyMs: number,
    costMicrounits: number,
    outcome: "succeeded" | "reconciled",
  ): Promise<MediaOutcome> {
    try {
      const completion = await this.#store.completeMediaAttempt(
        claim,
        this.#workerId,
        attempt,
        validation,
        etag,
        providerNeutralCorrelationId,
        latencyMs,
        costMicrounits,
      );
      await this.#store.acknowledgeOutboxEvent(claim, this.#workerId, deliveryKey(claim.eventId));
      this.#record(
        outcome === "reconciled" ? "media_reconciled" : "media_completed",
        "pass",
        claim,
        attempt,
        undefined,
        completion.artifactId,
      );
      return outcome;
    } catch {
      this.#record("completion_deferred", "deferred", claim, attempt, "database.completion_failed");
      return "deferred";
    }
  }

  async #acknowledge(
    claim: MediaEventClaim,
    attempt: MediaAttemptLease,
    outcome: "replayed" | "cancelled",
  ): Promise<MediaOutcome> {
    try {
      await this.#store.acknowledgeOutboxEvent(claim, this.#workerId, deliveryKey(claim.eventId));
      this.#record(
        outcome === "replayed" ? "media_replay_verified" : "media_cancelled",
        outcome === "cancelled" ? "cancelled" : "pass",
        claim,
        attempt,
      );
      return outcome;
    } catch {
      this.#record(
        "acknowledgement_deferred",
        "deferred",
        claim,
        attempt,
        "database.acknowledgement_failed",
      );
      return "deferred";
    }
  }

  async #failCurrent(
    claim: MediaEventClaim,
    attempt: MediaAttemptLease,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<MediaOutcome> {
    if (!attempt.attemptId) {
      return "deferred";
    }
    try {
      await this.#store.failMediaAttempt(
        claim,
        this.#workerId,
        attempt.attemptId,
        errorCode,
        retryAfterSeconds,
      );
      const delivery = await this.#store.failOutboxEvent(
        claim,
        this.#workerId,
        errorCode,
        retryAfterSeconds,
        attempt.maxAttempts,
      );
      const outcome = delivery === "dead_letter" ? "dead_letter" : "retried";
      this.#record(
        "media_attempt_failed",
        outcome === "dead_letter" ? "dead_letter" : "retry",
        claim,
        attempt,
        errorCode,
      );
      return outcome;
    } catch {
      return "deferred";
    }
  }

  async #failTerminal(
    claim: MediaEventClaim,
    attempt: MediaAttemptLease,
    retryAfterSeconds: number,
  ): Promise<MediaOutcome> {
    try {
      const state = await this.#store.failOutboxEvent(
        claim,
        this.#workerId,
        "media.max_attempts_exceeded",
        retryAfterSeconds,
        attempt.maxAttempts,
      );
      return state === "dead_letter" ? "dead_letter" : "retried";
    } catch {
      return "deferred";
    }
  }

  async #safeReconciliation(
    claim: MediaEventClaim,
    input: MediaReconciliationInput,
  ): Promise<void> {
    try {
      await this.#store.recordReconciliation(claim, this.#workerId, input);
    } catch {
      this.#record(
        "reconciliation_evidence_deferred",
        "deferred",
        claim,
        undefined,
        "database.reconciliation_failed",
      );
    }
  }

  #record(
    action: string,
    status: MediaWorkerEvidenceRecord["status"],
    claim?: MediaEventClaim,
    attempt?: MediaAttemptLease,
    errorCode?: string,
    artifactId?: Uuid,
  ): void {
    this.#evidence.record({
      action,
      check: "m2_1_durable_media_worker",
      status,
      worker_id: this.#workerId,
      ...(claim ? { event_id: claim.eventId, media_job_id: claim.mediaJobId } : {}),
      ...(attempt ? { attempt_number: attempt.attemptNumber } : {}),
      ...(errorCode ? { error_code: errorCode } : {}),
      ...(artifactId ? { artifact_id: artifactId } : {}),
    });
  }
}

export function createMediaJsonLineEvidenceSink(
  write: (line: string) => void,
): MediaWorkerEvidenceSink {
  return Object.freeze({
    record(record: MediaWorkerEvidenceRecord): void {
      write(`${JSON.stringify(record)}\n`);
    },
  });
}
