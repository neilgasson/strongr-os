import {
  createGenerationOutputHash,
  GenerationProviderError,
  type GenerationAdapter,
  type GenerationAdapterIdentity,
  type GenerationResult,
} from "../../../packages/ai/src/index.ts";
import {
  type AudioReflectionBrief,
  parseAudioReflection,
  parseAudioReflectionBrief,
  parseStrongrDailyAudioReflectionV2,
} from "../../../packages/content-schemas/src/index.ts";
import type { JsonValue, Uuid } from "../../../packages/contracts/src/index.ts";

export interface GenerationEventClaim {
  readonly eventId: Uuid;
  readonly organizationId: Uuid;
  readonly eventType: "content.generation_requested.v1";
  readonly eventVersion: 1;
  readonly aggregateType: "generation_job";
  readonly generationJobId: Uuid;
  readonly payload: JsonValue;
  readonly correlationId: Uuid;
  readonly causationId: Uuid | null;
  readonly attemptNumber: number;
  readonly leaseToken: Uuid;
  readonly leaseExpiresAt: string;
}

export type GenerationAttemptDisposition =
  | "ready"
  | "already_succeeded"
  | "cancelled"
  | "dead_letter";

export interface GenerationAttemptLease {
  readonly disposition: GenerationAttemptDisposition;
  readonly organizationId: Uuid;
  readonly generationJobId: Uuid;
  readonly correlationId: Uuid;
  readonly promptKey: string;
  readonly promptVersion: number;
  readonly promptChecksum: string;
  readonly brief: unknown;
  readonly attemptId: Uuid | null;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
}

export type DeliveryFailureState = "failed" | "dead_letter" | "delivered";
export type GenerationFailureState = "failed" | "dead_letter";

export interface GenerationCompletion {
  readonly completionState: "succeeded";
  readonly contentVersionId: Uuid;
}

export interface GenerationWorkerStore {
  claimGenerationEvents(
    workerId: string,
    batchSize: number,
    leaseSeconds: number,
  ): Promise<readonly GenerationEventClaim[]>;
  beginGenerationAttempt(
    claim: GenerationEventClaim,
    workerId: string,
    identity: GenerationAdapterIdentity,
  ): Promise<GenerationAttemptLease>;
  completeGenerationAttempt(
    claim: GenerationEventClaim,
    workerId: string,
    attemptId: Uuid,
    result: GenerationResult,
    latencyMs: number,
  ): Promise<GenerationCompletion>;
  failGenerationAttempt(
    claim: GenerationEventClaim,
    workerId: string,
    attemptId: Uuid,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<GenerationFailureState>;
  failOutboxEvent(
    claim: GenerationEventClaim,
    workerId: string,
    errorCode: string,
    retryAfterSeconds: number,
    maxAttempts: number,
  ): Promise<DeliveryFailureState>;
  acknowledgeOutboxEvent(
    claim: GenerationEventClaim,
    workerId: string,
    deliveryKey: string,
  ): Promise<Uuid>;
  heartbeat(
    workerId: string,
    status: "idle" | "working" | "degraded" | "stopped",
    metadata: Readonly<Record<string, JsonValue>>,
  ): Promise<void>;
}

export type WorkerEvidenceStatus = "pass" | "retry" | "dead_letter" | "deferred" | "cancelled";

export interface WorkerEvidenceRecord {
  readonly check: "m1_1_durable_worker";
  readonly action: string;
  readonly status: WorkerEvidenceStatus;
  readonly worker_id: string;
  readonly event_id?: Uuid;
  readonly generation_job_id?: Uuid;
  readonly attempt_number?: number;
  readonly content_version_id?: Uuid;
  readonly error_code?: string;
}

export interface WorkerEvidenceSink {
  record(record: WorkerEvidenceRecord): void;
}

export interface DurableWorkerOptions {
  readonly batchSize?: number;
  readonly leaseSeconds?: number;
  readonly retryAfterSeconds?: number;
}

export interface DurableWorkerBatchSummary {
  readonly claimed: number;
  readonly succeeded: number;
  readonly replayed: number;
  readonly retried: number;
  readonly deadLettered: number;
  readonly cancelled: number;
  readonly deferred: number;
}

type EventOutcome = "succeeded" | "replayed" | "retried" | "dead_letter" | "cancelled" | "deferred";

const noopEvidenceSink: WorkerEvidenceSink = Object.freeze({
  record(): void {},
});

function requireIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function deliveryKey(eventId: Uuid): string {
  return `generation-${eventId}`;
}

function validGenerationResult(
  result: GenerationResult,
  identity: GenerationAdapterIdentity,
  promptChecksum: string,
  brief: AudioReflectionBrief | import("../../../packages/content-schemas/src/index.ts").StrongrDailyAudioReflectionV2Brief,
): boolean {
  try {
    const expectedSchemaId =
      brief.schema_id === "strongr.strongr_daily_audio_reflection_brief.v2"
        ? "strongr.strongr_daily_audio_reflection.v2"
        : "strongr.audio_reflection.v1";
    const output =
      expectedSchemaId === "strongr.strongr_daily_audio_reflection.v2"
        ? parseStrongrDailyAudioReflectionV2(result.output)
        : parseAudioReflection(result.output);
    return (
      result.provider === identity.provider &&
      result.model === identity.model &&
      result.promptChecksum === promptChecksum &&
      result.responseSchemaId === expectedSchemaId &&
      result.output.schema_id === expectedSchemaId &&
      result.outputHash === createGenerationOutputHash(output)
    );
  } catch {
    return false;
  }
}

export class DurableGenerationWorker {
  readonly #adapter: GenerationAdapter;
  readonly #clock: () => number;
  readonly #evidence: WorkerEvidenceSink;
  readonly #store: GenerationWorkerStore;
  readonly #workerId: string;

  constructor(input: {
    readonly adapter: GenerationAdapter;
    readonly clock?: () => number;
    readonly evidence?: WorkerEvidenceSink;
    readonly store: GenerationWorkerStore;
    readonly workerId: string;
  }) {
    this.#adapter = input.adapter;
    this.#clock = input.clock ?? (() => performance.now());
    this.#evidence = input.evidence ?? noopEvidenceSink;
    this.#store = input.store;
    this.#workerId = input.workerId;
  }

  async runOnce(options: DurableWorkerOptions = {}): Promise<DurableWorkerBatchSummary> {
    const batchSize = requireIntegerInRange(options.batchSize ?? 10, 1, 100, "batch size");
    const leaseSeconds = requireIntegerInRange(
      options.leaseSeconds ?? 60,
      1,
      3_600,
      "lease duration",
    );
    const retryAfterSeconds = requireIntegerInRange(
      options.retryAfterSeconds ?? 30,
      0,
      86_400,
      "retry delay",
    );

    const claims = await this.#store.claimGenerationEvents(this.#workerId, batchSize, leaseSeconds);
    this.#record("batch_claimed", "pass");

    const outcomes: EventOutcome[] = [];
    for (const claim of claims) {
      outcomes.push(await this.#processClaim(claim, retryAfterSeconds));
    }

    const summary: DurableWorkerBatchSummary = Object.freeze({
      claimed: claims.length,
      succeeded: outcomes.filter((outcome) => outcome === "succeeded").length,
      replayed: outcomes.filter((outcome) => outcome === "replayed").length,
      retried: outcomes.filter((outcome) => outcome === "retried").length,
      deadLettered: outcomes.filter((outcome) => outcome === "dead_letter").length,
      cancelled: outcomes.filter((outcome) => outcome === "cancelled").length,
      deferred: outcomes.filter((outcome) => outcome === "deferred").length,
    });

    const heartbeatStatus = summary.deadLettered > 0 || summary.deferred > 0 ? "degraded" : "idle";
    await this.#store.heartbeat(this.#workerId, heartbeatStatus, {
      claimed: summary.claimed,
      dead_lettered: summary.deadLettered,
      deferred: summary.deferred,
      retried: summary.retried,
      succeeded: summary.succeeded,
    });
    this.#record("batch_completed", heartbeatStatus === "idle" ? "pass" : "deferred");
    return summary;
  }

  async #processClaim(
    claim: GenerationEventClaim,
    retryAfterSeconds: number,
  ): Promise<EventOutcome> {
    let attempt: GenerationAttemptLease;
    try {
      attempt = await this.#store.beginGenerationAttempt(
        claim,
        this.#workerId,
        this.#adapter.identity,
      );
    } catch {
      this.#record("attempt_begin_deferred", "deferred", claim, undefined, "database.begin_failed");
      return "deferred";
    }

    if (attempt.disposition === "already_succeeded") {
      return this.#acknowledgeTerminal(claim, attempt, "replayed");
    }
    if (attempt.disposition === "cancelled") {
      return this.#acknowledgeTerminal(claim, attempt, "cancelled");
    }
    if (attempt.disposition === "dead_letter") {
      return this.#failTerminalOutbox(
        claim,
        attempt,
        "generation.max_attempts_exceeded",
        retryAfterSeconds,
      );
    }
    if (!attempt.attemptId) {
      this.#record(
        "attempt_begin_deferred",
        "deferred",
        claim,
        attempt,
        "database.attempt_id_missing",
      );
      return "deferred";
    }

    let brief: AudioReflectionBrief;
    try {
      brief = parseAudioReflectionBrief(attempt.brief);
    } catch {
      return this.#failCurrentAttempt(
        claim,
        attempt,
        "generation.invalid_brief",
        retryAfterSeconds,
      );
    }

    const request = {
      brief,
      correlationId: attempt.correlationId,
      generationJobId: attempt.generationJobId,
      organizationId: attempt.organizationId,
      promptKey: attempt.promptKey,
      promptVersion: attempt.promptVersion,
    };

    let result: GenerationResult;
    const startedAt = this.#clock();
    try {
      result = await this.#adapter.generate(request);
    } catch (error) {
      return this.#failCurrentAttempt(
        claim,
        attempt,
        error instanceof GenerationProviderError ? error.safeCode : "generation.adapter_failed",
        retryAfterSeconds,
      );
    }
    const latencyMs = Math.max(0, Math.round(this.#clock() - startedAt));

    if (!validGenerationResult(result, this.#adapter.identity, attempt.promptChecksum, brief)) {
      return this.#failCurrentAttempt(
        claim,
        attempt,
        "generation.provenance_mismatch",
        retryAfterSeconds,
      );
    }

    let completion: GenerationCompletion;
    try {
      completion = await this.#store.completeGenerationAttempt(
        claim,
        this.#workerId,
        attempt.attemptId,
        result,
        latencyMs,
      );
    } catch {
      this.#record("completion_deferred", "deferred", claim, attempt, "database.completion_failed");
      return "deferred";
    }

    try {
      await this.#store.acknowledgeOutboxEvent(claim, this.#workerId, deliveryKey(claim.eventId));
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

    this.#record(
      "generation_completed",
      "pass",
      claim,
      attempt,
      undefined,
      completion.contentVersionId,
    );
    return "succeeded";
  }

  async #acknowledgeTerminal(
    claim: GenerationEventClaim,
    attempt: GenerationAttemptLease,
    terminal: "replayed" | "cancelled",
  ): Promise<EventOutcome> {
    try {
      await this.#store.acknowledgeOutboxEvent(claim, this.#workerId, deliveryKey(claim.eventId));
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
    this.#record(
      terminal === "replayed" ? "generation_replay_acknowledged" : "generation_cancelled",
      terminal === "replayed" ? "pass" : "cancelled",
      claim,
      attempt,
    );
    return terminal;
  }

  async #failTerminalOutbox(
    claim: GenerationEventClaim,
    attempt: GenerationAttemptLease,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<EventOutcome> {
    try {
      const state = await this.#store.failOutboxEvent(
        claim,
        this.#workerId,
        errorCode,
        retryAfterSeconds,
        attempt.maxAttempts,
      );
      const outcome = state === "dead_letter" ? "dead_letter" : "retried";
      this.#record(
        "terminal_generation_recorded",
        state === "dead_letter" ? "dead_letter" : "retry",
        claim,
        attempt,
        errorCode,
      );
      return outcome;
    } catch {
      this.#record(
        "terminal_failure_deferred",
        "deferred",
        claim,
        attempt,
        "database.failure_record_failed",
      );
      return "deferred";
    }
  }

  async #failCurrentAttempt(
    claim: GenerationEventClaim,
    attempt: GenerationAttemptLease,
    errorCode: string,
    retryAfterSeconds: number,
  ): Promise<EventOutcome> {
    if (!attempt.attemptId) {
      this.#record(
        "attempt_failure_deferred",
        "deferred",
        claim,
        attempt,
        "database.attempt_id_missing",
      );
      return "deferred";
    }

    try {
      await this.#store.failGenerationAttempt(
        claim,
        this.#workerId,
        attempt.attemptId,
        errorCode,
        retryAfterSeconds,
      );
      const deliveryState = await this.#store.failOutboxEvent(
        claim,
        this.#workerId,
        errorCode,
        retryAfterSeconds,
        attempt.maxAttempts,
      );
      const outcome = deliveryState === "dead_letter" ? "dead_letter" : "retried";
      this.#record(
        "generation_failed",
        deliveryState === "dead_letter" ? "dead_letter" : "retry",
        claim,
        attempt,
        errorCode,
      );
      return outcome;
    } catch {
      this.#record(
        "attempt_failure_deferred",
        "deferred",
        claim,
        attempt,
        "database.failure_record_failed",
      );
      return "deferred";
    }
  }

  #record(
    action: string,
    status: WorkerEvidenceStatus,
    claim?: GenerationEventClaim,
    attempt?: GenerationAttemptLease,
    errorCode?: string,
    contentVersionId?: Uuid,
  ): void {
    this.#evidence.record({
      action,
      check: "m1_1_durable_worker",
      status,
      worker_id: this.#workerId,
      ...(claim ? { event_id: claim.eventId } : {}),
      ...(attempt
        ? {
            attempt_number: attempt.attemptNumber,
            generation_job_id: attempt.generationJobId,
          }
        : {}),
      ...(errorCode ? { error_code: errorCode } : {}),
      ...(contentVersionId ? { content_version_id: contentVersionId } : {}),
    });
  }
}

export function createJsonLineEvidenceSink(write: (line: string) => void): WorkerEvidenceSink {
  return Object.freeze({
    record(record: WorkerEvidenceRecord): void {
      write(`${JSON.stringify(record)}\n`);
    },
  });
}
