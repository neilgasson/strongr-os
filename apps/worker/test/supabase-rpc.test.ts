import assert from "node:assert/strict";
import test from "node:test";

import {
  SupabaseGenerationWorkerStore,
  SupabaseRpcClient,
  SupabaseRpcError,
} from "../src/index.ts";
import { deterministicGenerationAdapter } from "../../../packages/ai/src/index.ts";
import { audioReflectionBriefFixture, fixtureIds } from "../../../packages/testing/src/index.ts";
import type { GenerationEventClaim } from "../src/index.ts";
import type { WorkerEnvironment } from "../src/environment.ts";

const secretEnvironment: WorkerEnvironment = Object.freeze({
  privilegedKeyKind: "secret",
  supabasePrivilegedKey: "sb_secret_rpc_fixture_123456",
  supabaseUrl: "https://example.supabase.co",
  workerId: "m1-worker-rpc",
});

test("secret-key RPC uses apikey only and does not retry mutating calls", async () => {
  const requests: { readonly input: string; readonly init?: RequestInit }[] = [];
  const client = new SupabaseRpcClient(secretEnvironment, (input, init) => {
    requests.push({ input: String(input), ...(init ? { init } : {}) });
    return Promise.resolve(
      Response.json(
        {
          code: "55000",
          message: "private database detail that must not be rethrown",
        },
        { status: 503 },
      ),
    );
  });

  await assert.rejects(
    () => client.rpc("m1_begin_generation_attempt", { p_worker_id: "m1-worker-rpc" }),
    (error: unknown) => {
      assert.ok(error instanceof SupabaseRpcError);
      assert.equal(error.databaseCode, "55000");
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /private database detail|sb_secret/);
      return true;
    },
  );

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.input,
    "https://example.supabase.co/rest/v1/rpc/m1_begin_generation_attempt",
  );
  const headers = requests[0]?.init?.headers as Record<string, string>;
  assert.equal(headers.apikey, secretEnvironment.supabasePrivilegedKey);
  assert.equal(headers.Authorization, undefined);
  assert.equal(requests[0]?.init?.method, "POST");
});

test("legacy service-role RPC adds its JWT authorization header", async () => {
  let capturedHeaders: Record<string, string> | undefined;
  const environment: WorkerEnvironment = Object.freeze({
    privilegedKeyKind: "legacy_service_role",
    supabasePrivilegedKey: "x".repeat(40),
    supabaseUrl: "https://example.supabase.co",
    workerId: "m1-worker-legacy",
  });
  const client = new SupabaseRpcClient(environment, (_input, init) => {
    capturedHeaders = init?.headers as Record<string, string>;
    return Promise.resolve(Response.json("succeeded"));
  });

  const result = await client.rpc<string>("m1_complete_generation_attempt", {
    p_worker_id: environment.workerId,
  });

  assert.equal(result, "succeeded");
  assert.equal(capturedHeaders?.apikey, environment.supabasePrivilegedKey);
  assert.equal(capturedHeaders?.Authorization, `Bearer ${environment.supabasePrivilegedKey}`);
});

test("worker completion sends validated output and returns the durable draft identity", async () => {
  const contentVersionId = "00000000-0000-4000-8000-000000000009";
  let capturedBody: Readonly<Record<string, unknown>> | undefined;
  const client = new SupabaseRpcClient(secretEnvironment, (_input, init) => {
    capturedBody = JSON.parse(String(init?.body)) as Readonly<Record<string, unknown>>;
    return Promise.resolve(
      Response.json([
        {
          completion_state: "succeeded",
          content_version_id: contentVersionId,
        },
      ]),
    );
  });
  const store = new SupabaseGenerationWorkerStore(client);
  const claim: GenerationEventClaim = {
    aggregateType: "generation_job",
    attemptNumber: 1,
    causationId: null,
    correlationId: fixtureIds.correlationId,
    eventId: "00000000-0000-4000-8000-000000000005",
    eventType: "content.generation_requested.v1",
    eventVersion: 1,
    generationJobId: fixtureIds.generationJobId,
    leaseExpiresAt: "2026-07-26T17:00:00Z",
    leaseToken: "00000000-0000-4000-8000-000000000008",
    organizationId: fixtureIds.organizationAlphaId,
    payload: { job_id: fixtureIds.generationJobId },
  };
  const generation = await deterministicGenerationAdapter.generate({
    brief: audioReflectionBriefFixture,
    correlationId: fixtureIds.correlationId,
    generationJobId: fixtureIds.generationJobId,
    organizationId: fixtureIds.organizationAlphaId,
    promptKey: "strongr.audio_reflection.fixture",
    promptVersion: 1,
  });

  const completion = await store.completeGenerationAttempt(
    claim,
    secretEnvironment.workerId,
    "00000000-0000-4000-8000-000000000006",
    generation,
    37,
  );

  assert.deepEqual(completion, {
    completionState: "succeeded",
    contentVersionId,
  });
  assert.deepEqual(capturedBody?.p_output, generation.output);
  assert.equal(capturedBody?.p_output_hash, generation.outputHash);
  assert.equal(capturedBody?.p_response_schema_id, "strongr.audio_reflection.v1");
});
