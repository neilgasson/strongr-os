import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationPromptChecksum,
  deterministicGenerationAdapter,
  type GenerationAdapter,
} from "../../../packages/ai/src/index.ts";
import { audioReflectionBriefFixture, fixtureIds } from "../../../packages/testing/src/index.ts";
import {
  DurableGenerationWorker,
  type GenerationAttemptLease,
  type GenerationEventClaim,
  type GenerationWorkerStore,
  type WorkerEvidenceRecord,
} from "../src/index.ts";

const eventId = "00000000-0000-4000-8000-000000000005";
const attemptId = "00000000-0000-4000-8000-000000000006";
const receiptId = "00000000-0000-4000-8000-000000000007";
const contentVersionId = "00000000-0000-4000-8000-000000000009";

const claim: GenerationEventClaim = Object.freeze({
  aggregateType: "generation_job",
  attemptNumber: 1,
  causationId: null,
  correlationId: fixtureIds.correlationId,
  eventId,
  eventType: "content.generation_requested.v1",
  eventVersion: 1,
  generationJobId: fixtureIds.generationJobId,
  leaseExpiresAt: "2026-07-26T17:00:00Z",
  leaseToken: "00000000-0000-4000-8000-000000000008",
  organizationId: fixtureIds.organizationAlphaId,
  payload: { job_id: fixtureIds.generationJobId },
});

const readyAttempt: GenerationAttemptLease = Object.freeze({
  attemptId,
  attemptNumber: 1,
  brief: audioReflectionBriefFixture,
  correlationId: fixtureIds.correlationId,
  disposition: "ready",
  generationJobId: fixtureIds.generationJobId,
  maxAttempts: 3,
  organizationId: fixtureIds.organizationAlphaId,
  promptChecksum: createGenerationPromptChecksum("strongr.audio_reflection.fixture", 1),
  promptKey: "strongr.audio_reflection.fixture",
  promptVersion: 1,
});

function createStore(overrides: Partial<GenerationWorkerStore> = {}): {
  readonly calls: string[];
  readonly store: GenerationWorkerStore;
} {
  const calls: string[] = [];
  const store: GenerationWorkerStore = {
    acknowledgeOutboxEvent() {
      calls.push("acknowledge");
      return Promise.resolve(receiptId);
    },
    beginGenerationAttempt() {
      calls.push("begin");
      return Promise.resolve(readyAttempt);
    },
    claimGenerationEvents() {
      calls.push("claim");
      return Promise.resolve([claim]);
    },
    completeGenerationAttempt() {
      calls.push("complete");
      return Promise.resolve({
        completionState: "succeeded" as const,
        contentVersionId,
      });
    },
    failGenerationAttempt() {
      calls.push("fail-generation");
      return Promise.resolve("failed");
    },
    failOutboxEvent() {
      calls.push("fail-outbox");
      return Promise.resolve("failed");
    },
    heartbeat() {
      calls.push("heartbeat");
      return Promise.resolve();
    },
    ...overrides,
  };
  return { calls, store };
}

function createEvidenceSink(records: WorkerEvidenceRecord[]) {
  return {
    record(record: WorkerEvidenceRecord) {
      records.push(record);
    },
  };
}

test("durable worker completes and acknowledges a governed generation attempt", async () => {
  const { calls, store } = createStore();
  const records: WorkerEvidenceRecord[] = [];
  const clockValues = [100, 142];
  const worker = new DurableGenerationWorker({
    adapter: deterministicGenerationAdapter,
    clock: () => clockValues.shift() ?? 142,
    evidence: createEvidenceSink(records),
    store,
    workerId: "m1-worker-1",
  });

  const summary = await worker.runOnce();

  assert.deepEqual(summary, {
    cancelled: 0,
    claimed: 1,
    deadLettered: 0,
    deferred: 0,
    replayed: 0,
    retried: 0,
    succeeded: 1,
  });
  assert.deepEqual(calls, ["claim", "begin", "complete", "acknowledge", "heartbeat"]);
  assert.ok(
    records.some(
      (record) =>
        record.action === "generation_completed" && record.content_version_id === contentVersionId,
    ),
  );
  const serialized = JSON.stringify(records);
  assert.doesNotMatch(serialized, /Synthetic Reflection Fixture/);
  assert.doesNotMatch(serialized, /leaseToken|output|brief|apikey|secret/i);
});

test("completed generation replay acknowledges without invoking the adapter", async () => {
  let generationCalls = 0;
  const adapter: GenerationAdapter = {
    generate() {
      generationCalls += 1;
      return deterministicGenerationAdapter.generate({
        brief: audioReflectionBriefFixture,
        correlationId: fixtureIds.correlationId,
        generationJobId: fixtureIds.generationJobId,
        organizationId: fixtureIds.organizationAlphaId,
        promptKey: readyAttempt.promptKey,
        promptVersion: readyAttempt.promptVersion,
      });
    },
    identity: deterministicGenerationAdapter.identity,
  };
  const { calls, store } = createStore({
    beginGenerationAttempt() {
      calls.push("begin");
      return Promise.resolve({ ...readyAttempt, disposition: "already_succeeded" });
    },
  });
  const worker = new DurableGenerationWorker({
    adapter,
    store,
    workerId: "m1-worker-replay",
  });

  const summary = await worker.runOnce();

  assert.equal(generationCalls, 0);
  assert.equal(summary.replayed, 1);
  assert.deepEqual(calls, ["claim", "begin", "acknowledge", "heartbeat"]);
});

test("adapter failure records retry state in job then outbox order", async () => {
  const adapter: GenerationAdapter = {
    generate() {
      return Promise.reject(new Error("synthetic provider failure"));
    },
    identity: deterministicGenerationAdapter.identity,
  };
  const { calls, store } = createStore();
  const records: WorkerEvidenceRecord[] = [];
  const worker = new DurableGenerationWorker({
    adapter,
    evidence: createEvidenceSink(records),
    store,
    workerId: "m1-worker-retry",
  });

  const summary = await worker.runOnce({ retryAfterSeconds: 0 });

  assert.equal(summary.retried, 1);
  assert.deepEqual(calls, ["claim", "begin", "fail-generation", "fail-outbox", "heartbeat"]);
  assert.ok(
    records.some(
      (record) =>
        record.action === "generation_failed" &&
        record.error_code === "generation.adapter_failed" &&
        record.status === "retry",
    ),
  );
});

test("terminal failure becomes visible dead-letter evidence", async () => {
  const adapter: GenerationAdapter = {
    generate() {
      return Promise.reject(new Error("synthetic poison message"));
    },
    identity: deterministicGenerationAdapter.identity,
  };
  const { calls, store } = createStore({
    failGenerationAttempt() {
      calls.push("fail-generation");
      return Promise.resolve("dead_letter");
    },
    failOutboxEvent() {
      calls.push("fail-outbox");
      return Promise.resolve("dead_letter");
    },
  });
  const worker = new DurableGenerationWorker({
    adapter,
    store,
    workerId: "m1-worker-dead-letter",
  });

  const summary = await worker.runOnce();

  assert.equal(summary.deadLettered, 1);
  assert.deepEqual(calls, ["claim", "begin", "fail-generation", "fail-outbox", "heartbeat"]);
});

test("acknowledgement failure is deferred for lease recovery after completion", async () => {
  const { calls, store } = createStore({
    acknowledgeOutboxEvent() {
      calls.push("acknowledge");
      return Promise.reject(new Error("synthetic acknowledgement failure"));
    },
  });
  const worker = new DurableGenerationWorker({
    adapter: deterministicGenerationAdapter,
    store,
    workerId: "m1-worker-ack-recovery",
  });

  const summary = await worker.runOnce();

  assert.equal(summary.deferred, 1);
  assert.deepEqual(calls, ["claim", "begin", "complete", "acknowledge", "heartbeat"]);
  assert.ok(!calls.includes("fail-generation"));
  assert.ok(!calls.includes("fail-outbox"));
});

test("invalid brief fails before the adapter sees private content", async () => {
  let generationCalls = 0;
  const adapter: GenerationAdapter = {
    generate() {
      generationCalls += 1;
      return Promise.reject(new Error("must not run"));
    },
    identity: deterministicGenerationAdapter.identity,
  };
  const { store } = createStore({
    beginGenerationAttempt() {
      return Promise.resolve({ ...readyAttempt, brief: { schema_id: "invalid" } });
    },
  });
  const worker = new DurableGenerationWorker({
    adapter,
    store,
    workerId: "m1-worker-invalid-brief",
  });

  const summary = await worker.runOnce();

  assert.equal(generationCalls, 0);
  assert.equal(summary.retried, 1);
});

test("tampered adapter output provenance fails before draft persistence", async () => {
  const adapter: GenerationAdapter = {
    async generate(request) {
      const result = await deterministicGenerationAdapter.generate(request);
      return { ...result, outputHash: "f".repeat(64) };
    },
    identity: deterministicGenerationAdapter.identity,
  };
  const { calls, store } = createStore();
  const worker = new DurableGenerationWorker({
    adapter,
    store,
    workerId: "m1-worker-invalid-output",
  });

  const summary = await worker.runOnce();

  assert.equal(summary.retried, 1);
  assert.deepEqual(calls, ["claim", "begin", "fail-generation", "fail-outbox", "heartbeat"]);
  assert.ok(!calls.includes("complete"));
});


test("durable worker creates a v2 generated draft without bypassing review", async () => {
  let completedSchemaId: string | null = null;
  const v2Brief = {
    audience: "Christian adults seeking a grounded daily reflection",
    content_type: "audio_reflection",
    desired_duration_seconds: 300,
    pastoral_purpose: "Offer a faithful next step rooted in Scripture.",
    prohibited_claims_or_wording: ["guaranteed outcome"],
    required_elements: ["welcome", "Scripture", "prayer", "takeaway"],
    schema_id: "strongr.strongr_daily_audio_reflection_brief.v2",
    scripture_reference: {
      reference: "Psalm 46:10",
      source_citation: "Psalm 46:10",
      translation: "NIV",
    },
    source_brief_identifier: "worker-v2-fixture",
    theme: "quiet trust",
    tone: "pastoral",
    working_title: "Quiet Trust",
  };
  const { calls, store } = createStore({
    beginGenerationAttempt() {
      calls.push("begin");
      return Promise.resolve({
        ...readyAttempt,
        brief: v2Brief,
        promptChecksum: createGenerationPromptChecksum("strongr.daily.v2", 1),
        promptKey: "strongr.daily.v2",
      });
    },
    completeGenerationAttempt(_claim, _workerId, _attemptId, result) {
      calls.push("complete");
      completedSchemaId = result.responseSchemaId;
      return Promise.resolve({
        completionState: "succeeded" as const,
        contentVersionId,
      });
    },
  });
  const worker = new DurableGenerationWorker({
    adapter: deterministicGenerationAdapter,
    store,
    workerId: "m1-worker-v2-draft",
  });

  const summary = await worker.runOnce();

  assert.equal(summary.succeeded, 1);
  assert.equal(completedSchemaId, "strongr.strongr_daily_audio_reflection.v2");
  assert.deepEqual(calls, ["claim", "begin", "complete", "acknowledge", "heartbeat"]);
});
