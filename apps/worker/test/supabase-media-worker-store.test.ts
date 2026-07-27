import assert from "node:assert/strict";
import test from "node:test";

import type { WorkerEnvironment } from "../src/environment.ts";
import type { MediaAttemptLease, MediaEventClaim } from "../src/media-worker.ts";
import { SupabaseMediaWorkerStore } from "../src/supabase-media-worker-store.ts";
import { SupabaseRpcClient } from "../src/supabase-rpc.ts";

const environment: WorkerEnvironment = Object.freeze({
  privilegedKeyKind: "secret",
  supabasePrivilegedKey: "sb_secret_m2workerfixture",
  supabaseUrl: "https://example.supabase.co",
  workerId: "m2-worker-store",
});

const claimRow = Object.freeze({
  aggregate_id: "26000000-0000-4000-8000-000000000003",
  aggregate_type: "media_job",
  attempt_number: 1,
  causation_id: null,
  correlation_id: "26000000-0000-4000-8000-000000000006",
  event_id: "26000000-0000-4000-8000-000000000007",
  event_type: "media.generation_requested.v1",
  event_version: 1,
  lease_expires_at: "2026-07-27T03:00:00Z",
  lease_token: "26000000-0000-4000-8000-000000000008",
  organization_id: "26000000-0000-4000-8000-000000000001",
  payload: { job_id: "26000000-0000-4000-8000-000000000003" },
});

const attemptRow = Object.freeze({
  artifact_id: "26000000-0000-4000-8000-000000000005",
  attempt_id: "26000000-0000-4000-8000-000000000004",
  attempt_number: 1,
  bits_per_sample: 16,
  channels: 1,
  codec: "pcm_s16le",
  container: "wav",
  correlation_id: claimRow.correlation_id,
  disposition: "ready",
  existing_byte_count: null,
  existing_sha256: null,
  input_hash: "a".repeat(64),
  max_attempts: 3,
  max_bytes: 26_214_400,
  max_duration_ms: 900_000,
  media_job_id: claimRow.aggregate_id,
  mime_type: "audio/wav",
  object_path:
    "26000000-0000-4000-8000-000000000001/26000000-0000-4000-8000-000000000002/26000000-0000-4000-8000-000000000005.wav",
  organization_id: claimRow.organization_id,
  output_spec_id: "20000000-0000-4000-8000-000000000001",
  production_package_id: "26000000-0000-4000-8000-000000000002",
  sample_rate_hz: 16_000,
});

test("media store maps exact service-role RPC contracts and parses bounded results", async () => {
  const calls: Array<{ rpc: string; body: Record<string, unknown> }> = [];
  const fetchImplementation = async (
    input: string | URL | Request,
    init: RequestInit = {},
  ): Promise<Response> => {
    const rpc = String(input).split("/").at(-1) ?? "";
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ body, rpc });
    if (rpc === "m2_claim_media_events") {
      return Response.json([claimRow]);
    }
    if (rpc === "m2_begin_media_attempt") {
      return Response.json([attemptRow]);
    }
    if (rpc === "m2_complete_media_attempt") {
      return Response.json(attemptRow.artifact_id);
    }
    throw new Error(`Unexpected RPC ${rpc}`);
  };
  const store = new SupabaseMediaWorkerStore(
    new SupabaseRpcClient(environment, fetchImplementation),
  );

  const claims = await store.claimMediaEvents("m2-worker-store", 5, 120);
  assert.equal(claims.length, 1);
  const claim = claims[0] as MediaEventClaim;
  assert.equal(claim.eventType, "media.generation_requested.v1");

  const attempt = await store.beginMediaAttempt(claim, "m2-worker-store", {
    adapterKey: "strongr.synthetic_audio",
    adapterVersion: "1.0.0",
  });
  assert.deepEqual(attempt, {
    artifactId: attemptRow.artifact_id,
    attemptId: attemptRow.attempt_id,
    attemptNumber: 1,
    correlationId: attemptRow.correlation_id,
    disposition: "ready",
    existingByteCount: null,
    existingSha256: null,
    inputHash: attemptRow.input_hash,
    maxAttempts: 3,
    mediaJobId: attemptRow.media_job_id,
    objectPath: attemptRow.object_path,
    organizationId: attemptRow.organization_id,
    outputSpec: {
      bitsPerSample: 16,
      channels: 1,
      codec: "pcm_s16le",
      container: "wav",
      maxBytes: 26_214_400,
      maxDurationMs: 900_000,
      mimeType: "audio/wav",
      sampleRateHz: 16_000,
    },
    outputSpecId: attemptRow.output_spec_id,
    productionPackageId: attemptRow.production_package_id,
  } satisfies MediaAttemptLease);

  const completion = await store.completeMediaAttempt(
    claim,
    "m2-worker-store",
    attempt,
    {
      bitsPerSample: 16,
      byteCount: 3_244,
      channels: 1,
      codec: "pcm_s16le",
      container: "wav",
      durationMs: 100,
      mimeType: "audio/wav",
      sampleRateHz: 16_000,
      sha256: "2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd",
      validationSchemaId: "strongr.media_validation.v1",
    },
    '"etag"',
    "synthetic-2976da01e205a110c9fa41d47659e238",
    25,
    0,
  );
  assert.equal(completion.artifactId, attemptRow.artifact_id);
  assert.deepEqual(
    calls.map(({ rpc }) => rpc),
    ["m2_claim_media_events", "m2_begin_media_attempt", "m2_complete_media_attempt"],
  );
  assert.deepEqual(calls[2]?.body, {
    p_attempt_id: attemptRow.attempt_id,
    p_bits_per_sample: 16,
    p_byte_count: 3_244,
    p_channels: 1,
    p_codec: "pcm_s16le",
    p_container: "wav",
    p_cost_microunits: 0,
    p_duration_ms: 100,
    p_event_id: claimRow.event_id,
    p_latency_ms: 25,
    p_lease_token: claimRow.lease_token,
    p_mime_type: "audio/wav",
    p_provider_correlation_id: "synthetic-2976da01e205a110c9fa41d47659e238",
    p_sample_rate_hz: 16_000,
    p_sha256: "2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd",
    p_storage_etag: '"etag"',
    p_validation_schema_id: "strongr.media_validation.v1",
    p_worker_id: "m2-worker-store",
  });
});
