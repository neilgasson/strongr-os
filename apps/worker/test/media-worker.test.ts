import assert from "node:assert/strict";
import test from "node:test";

import {
  createSyntheticPcmWav,
  deterministicMediaAdapter,
  syntheticAudioOutputSpec,
} from "../../../packages/media/src/index.ts";
import type { MediaAdapter } from "../../../packages/media/src/index.ts";
import {
  DurableMediaWorker,
  type MediaAttemptLease,
  type MediaEventClaim,
  type MediaReconciliationInput,
  type MediaWorkerEvidenceRecord,
  type MediaWorkerStore,
} from "../src/media-worker.ts";
import type {
  PrivateMediaStorage,
  StorageDownloadResult,
  StorageUploadResult,
} from "../src/supabase-storage.ts";

const claim: MediaEventClaim = Object.freeze({
  aggregateType: "media_job",
  attemptNumber: 1,
  causationId: null,
  correlationId: "26000000-0000-4000-8000-000000000006",
  eventId: "26000000-0000-4000-8000-000000000007",
  eventType: "media.generation_requested.v1",
  eventVersion: 1,
  leaseExpiresAt: "2026-07-27T03:00:00Z",
  leaseToken: "26000000-0000-4000-8000-000000000008",
  mediaJobId: "26000000-0000-4000-8000-000000000003",
  organizationId: "26000000-0000-4000-8000-000000000001",
  payload: { job_id: "26000000-0000-4000-8000-000000000003" },
});

const attempt: MediaAttemptLease = Object.freeze({
  artifactId: "26000000-0000-4000-8000-000000000005",
  attemptId: "26000000-0000-4000-8000-000000000004",
  attemptNumber: 1,
  correlationId: claim.correlationId,
  disposition: "ready",
  existingByteCount: null,
  existingSha256: null,
  inputHash: "a".repeat(64),
  maxAttempts: 3,
  mediaJobId: claim.mediaJobId,
  objectPath:
    "26000000-0000-4000-8000-000000000001/26000000-0000-4000-8000-000000000002/26000000-0000-4000-8000-000000000005.wav",
  organizationId: claim.organizationId,
  outputSpec: syntheticAudioOutputSpec,
  outputSpecId: "20000000-0000-4000-8000-000000000001",
  productionPackageId: "26000000-0000-4000-8000-000000000002",
});

function createStore(calls: string[], overrides: Partial<MediaWorkerStore> = {}): MediaWorkerStore {
  return {
    acknowledgeOutboxEvent() {
      calls.push("acknowledge");
      return Promise.resolve("26000000-0000-4000-8000-000000000009");
    },
    beginMediaAttempt() {
      calls.push("begin");
      return Promise.resolve(attempt);
    },
    claimMediaEvents() {
      calls.push("claim");
      return Promise.resolve([claim]);
    },
    completeMediaAttempt() {
      calls.push("complete");
      return Promise.resolve({
        artifactId: attempt.artifactId,
        completionState: "succeeded",
      });
    },
    failMediaAttempt() {
      calls.push("fail-media");
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
    recordReconciliation(_claim, _workerId, input) {
      calls.push(`reconcile:${input.eventType}:${input.outcome}`);
      return Promise.resolve("26000000-0000-4000-8000-000000000010");
    },
    ...overrides,
  };
}

function createStorage(
  upload: StorageUploadResult,
  download: StorageDownloadResult = { disposition: "not_found" },
): PrivateMediaStorage {
  return {
    download() {
      return Promise.resolve(download);
    },
    uploadWriteOnce() {
      return Promise.resolve(upload);
    },
  };
}

test("worker validates, uploads once, records provenance, then acknowledges", async () => {
  const calls: string[] = [];
  const evidence: MediaWorkerEvidenceRecord[] = [];
  const worker = new DurableMediaWorker({
    adapter: deterministicMediaAdapter,
    clock: (() => {
      const values = [100, 125];
      return () => values.shift() ?? 125;
    })(),
    evidence: { record: (record) => evidence.push(record) },
    storage: createStorage({ disposition: "uploaded", etag: '"etag"' }),
    store: createStore(calls),
    workerId: "m2-worker-success",
  });

  assert.deepEqual(await worker.runOnce(), {
    cancelled: 0,
    claimed: 1,
    deadLettered: 0,
    deferred: 0,
    reconciled: 0,
    replayed: 0,
    retried: 0,
    succeeded: 1,
  });
  assert.deepEqual(calls, ["claim", "begin", "complete", "acknowledge", "heartbeat"]);
  assert.equal(evidence.at(-1)?.action, "media_completed");
  assert.doesNotMatch(JSON.stringify(evidence), /apikey|authorization|service.role|bytes/i);
});

test("write-once conflict verifies exact bytes and reconciles without overwrite", async () => {
  const calls: string[] = [];
  const worker = new DurableMediaWorker({
    adapter: deterministicMediaAdapter,
    storage: createStorage(
      { disposition: "conflict", etag: null },
      {
        bytes: createSyntheticPcmWav(),
        disposition: "found",
        etag: '"existing"',
      },
    ),
    store: createStore(calls),
    workerId: "m2-worker-reconcile",
  });

  const summary = await worker.runOnce();
  assert.equal(summary.reconciled, 1);
  assert.equal(summary.succeeded, 0);
  assert.deepEqual(calls, [
    "claim",
    "begin",
    "reconcile:reconciled:verified",
    "complete",
    "acknowledge",
    "heartbeat",
  ]);
});

test("checksum mismatch is blocked, recorded, and retried without overwrite", async () => {
  const calls: string[] = [];
  const changed = createSyntheticPcmWav();
  changed[44] = 1;
  const worker = new DurableMediaWorker({
    adapter: deterministicMediaAdapter,
    storage: createStorage(
      { disposition: "conflict", etag: null },
      { bytes: changed, disposition: "found", etag: null },
    ),
    store: createStore(calls),
    workerId: "m2-worker-mismatch",
  });

  const summary = await worker.runOnce();
  assert.equal(summary.retried, 1);
  assert.deepEqual(calls, [
    "claim",
    "begin",
    "reconcile:checksum_mismatch:blocked",
    "fail-media",
    "fail-outbox",
    "heartbeat",
  ]);
});

test("adapter failures are retried as adapter failures without touching Storage", async () => {
  const calls: string[] = [];
  const failingAdapter: MediaAdapter = Object.freeze({
    identity: deterministicMediaAdapter.identity,
    generate() {
      return Promise.reject(new Error("synthetic adapter failure"));
    },
  });
  const worker = new DurableMediaWorker({
    adapter: failingAdapter,
    storage: {
      download() {
        calls.push("download");
        return Promise.resolve({ disposition: "not_found" });
      },
      uploadWriteOnce() {
        calls.push("upload");
        return Promise.resolve({ disposition: "uploaded", etag: null });
      },
    },
    store: createStore(calls),
    workerId: "m2-worker-adapter-failure",
  });

  const summary = await worker.runOnce();
  assert.equal(summary.retried, 1);
  assert.ok(!calls.includes("upload"));
  assert.ok(!calls.includes("download"));
  assert.deepEqual(calls, ["claim", "begin", "fail-media", "fail-outbox", "heartbeat"]);
});

test("completed database artifact is not acknowledged when its object is missing", async () => {
  const calls: string[] = [];
  const completedAttempt: MediaAttemptLease = Object.freeze({
    ...attempt,
    attemptId: null,
    disposition: "already_succeeded",
    existingByteCount: 3_244,
    existingSha256: "2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd",
  });
  const reconciliations: MediaReconciliationInput[] = [];
  const worker = new DurableMediaWorker({
    adapter: deterministicMediaAdapter,
    storage: createStorage({ disposition: "uploaded", etag: null }, { disposition: "not_found" }),
    store: createStore(calls, {
      beginMediaAttempt() {
        calls.push("begin");
        return Promise.resolve(completedAttempt);
      },
      recordReconciliation(_claim, _workerId, input) {
        calls.push(`reconcile:${input.eventType}:${input.outcome}`);
        reconciliations.push(input);
        return Promise.resolve("26000000-0000-4000-8000-000000000010");
      },
    }),
    workerId: "m2-worker-missing",
  });

  const summary = await worker.runOnce();
  assert.equal(summary.deferred, 1);
  assert.ok(!calls.includes("acknowledge"));
  assert.equal(reconciliations[0]?.mediaArtifactId, attempt.artifactId);
  assert.deepEqual(calls, ["claim", "begin", "reconcile:object_missing:blocked", "heartbeat"]);
});
