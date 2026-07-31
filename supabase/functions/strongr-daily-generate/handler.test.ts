import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  DurableWorkerBatchSummary,
  WorkerEnvironment,
} from "../../../apps/worker/src/index.ts";
import { strongrDailyContentProfileSourceManifestV1 } from "../../../packages/content-profiles/src/strongr-daily-v1.ts";
import { contentProfileSelectionFixture } from "../../../packages/testing/src/index.ts";
import {
  createStrongrDailyGenerateHandler,
  type StrongrDailyGenerateFetch,
  type StrongrDailyGenerationRuntimeFactory,
  strongrDailyGenerationBoundary,
} from "./handler.ts";

const organizationId = "00000000-0000-4000-8000-000000000001";
const generationJobId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000004";
const contentVersionId = "00000000-0000-4000-8000-000000000009";
const accessToken = `user_access_${"x".repeat(32)}`;
const anonKey = `anon_${"a".repeat(32)}`;
const serviceRoleKey = `service_role_${"s".repeat(32)}`;
const openAiApiKey = `sk_provider_${"p".repeat(32)}`;

const environment = Object.freeze({
  OPENAI_API_KEY: openAiApiKey,
  SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  SUPABASE_URL: strongrDailyGenerationBoundary.supabaseUrl,
});

const succeededSummary: DurableWorkerBatchSummary = Object.freeze({
  cancelled: 0,
  claimed: 1,
  deadLettered: 0,
  deferred: 0,
  replayed: 0,
  retried: 0,
  succeeded: 1,
});

test("Supabase gateway JWT verification remains enabled for the generation function", async () => {
  const config = await readFile(new URL("../../config.toml", import.meta.url), "utf8");
  assert.match(config, /\[functions\.strongr-daily-generate\]\s+verify_jwt\s*=\s*true(?:\s|$)/);
});

function request(
  body: unknown = { generation_job_id: generationJobId },
  overrides: {
    readonly contentType?: string;
    readonly method?: string;
    readonly origin?: string;
    readonly token?: string;
  } = {},
): Request {
  const method = overrides.method ?? "POST";
  return new Request("https://edge.example.test/strongr-daily-generate", {
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    headers: {
      Authorization: `Bearer ${overrides.token ?? accessToken}`,
      "Content-Type": overrides.contentType ?? "application/json",
      Origin: overrides.origin ?? strongrDailyGenerationBoundary.allowedOrigin,
    },
    method,
  });
}

function jobRow(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    attempt_count: 0,
    content_profile_checksum: contentProfileSelectionFixture.canonical_checksum,
    content_profile_content_type: contentProfileSelectionFixture.content_type,
    content_profile_id: contentProfileSelectionFixture.profile_id,
    content_profile_source_manifest_checksum:
      strongrDailyContentProfileSourceManifestV1.canonical_checksum,
    content_profile_version: contentProfileSelectionFixture.profile_version,
    id: generationJobId,
    max_attempts: 3,
    organization_id: organizationId,
    prompt_key: "strongr.strongr_daily.v2",
    prompt_version: 1,
    state: "queued",
    ...overrides,
  };
}

function successfulFetch(
  calls: { readonly input: string; readonly init?: RequestInit }[],
  job: unknown = [jobRow()],
  readbackState:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "dead_letter"
    | "cancelled" = "succeeded",
): StrongrDailyGenerateFetch {
  return (input, init) => {
    const url = String(input);
    calls.push({ input: url, ...(init ? { init } : {}) });
    if (url.endsWith("/auth/v1/user")) return Promise.resolve(Response.json({ id: userId }));
    if (url.endsWith("/rest/v1/rpc/has_permission")) return Promise.resolve(Response.json(true));
    if (url.includes("/rest/v1/content_versions?")) {
      return Promise.resolve(
        Response.json(readbackState === "succeeded" ? [{ id: contentVersionId }] : []),
      );
    }
    if (url.includes("/rest/v1/generation_job_attempts?")) {
      return Promise.resolve(
        Response.json([
          {
            cost_microunits: readbackState === "failed" ? null : 325,
            error_code: readbackState === "failed" ? "generation.provider_rejected" : null,
            input_tokens: readbackState === "failed" ? null : 10,
            output_tokens: readbackState === "failed" ? null : 20,
          },
        ]),
      );
    }
    if (url.includes("/rest/v1/generation_jobs?")) {
      if (url.includes("last_error_code")) {
        return Promise.resolve(
          Response.json([
            {
              id: generationJobId,
              last_error_code: readbackState === "failed" ? "generation.provider_rejected" : null,
              state: readbackState,
            },
          ]),
        );
      }
      return Promise.resolve(Response.json(job));
    }
    throw new Error("unexpected test request");
  };
}

function runtimeFactory(
  calls: string[],
  environments: WorkerEnvironment[],
  summary: DurableWorkerBatchSummary = succeededSummary,
): StrongrDailyGenerationRuntimeFactory {
  return (workerEnvironment) => {
    environments.push(workerEnvironment);
    return {
      runJobOnce(id) {
        calls.push(id);
        return Promise.resolve(summary);
      },
    };
  };
}

test("authenticated exact-job request invokes one development-only provider worker", async () => {
  const fetchCalls: { readonly input: string; readonly init?: RequestInit }[] = [];
  const runtimeCalls: string[] = [];
  const workerEnvironments: WorkerEnvironment[] = [];
  const handler = createStrongrDailyGenerateHandler({
    authorizeContentProfile: (selection, sourceManifestChecksum) =>
      selection.canonical_checksum === contentProfileSelectionFixture.canonical_checksum &&
      sourceManifestChecksum === strongrDailyContentProfileSourceManifestV1.canonical_checksum,
    environment,
    fetch: successfulFetch(fetchCalls),
    runtimeFactory: runtimeFactory(runtimeCalls, workerEnvironments),
  });

  const response = await handler(request());
  const body = (await response.json()) as Readonly<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    content_version_id: contentVersionId,
    error_code: null,
    estimated_cost_microunits: 325,
    generation_job_id: generationJobId,
    input_tokens: 10,
    output_tokens: 20,
    state: "succeeded",
  });
  assert.deepEqual(runtimeCalls, [generationJobId]);
  assert.equal(fetchCalls.length, 6);
  assert.ok(fetchCalls[1]?.input.includes(`id=eq.${generationJobId}`));
  assert.ok(!fetchCalls[1]?.input.includes("organization_id=eq."));
  assert.equal(workerEnvironments[0]?.generationProvider, "openai");
  assert.equal(workerEnvironments[0]?.supabaseUrl, strongrDailyGenerationBoundary.supabaseUrl);
  assert.equal(workerEnvironments[0]?.openAiModel, "gpt-5.6-terra");

  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, new RegExp(openAiApiKey));
  assert.doesNotMatch(serialized, new RegExp(serviceRoleKey));
  assert.doesNotMatch(serialized, new RegExp(accessToken));
});

test("production handler fails closed before runtime while every profile is inactive", async () => {
  const fetchCalls: { readonly input: string; readonly init?: RequestInit }[] = [];
  let runtimeCalls = 0;
  const handler = createStrongrDailyGenerateHandler({
    environment,
    fetch: successfulFetch(fetchCalls),
    runtimeFactory: () => ({
      runJobOnce() {
        runtimeCalls += 1;
        return Promise.resolve(succeededSummary);
      },
    }),
  });

  const response = await handler(request());

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error_code: "content_profile_not_active" });
  assert.equal(runtimeCalls, 0);
  assert.equal(fetchCalls.length, 3);
});

test("profile source-manifest provenance fails closed before runtime", async () => {
  let runtimeCalls = 0;
  for (const job of [
    jobRow({ content_profile_source_manifest_checksum: "0".repeat(64) }),
    jobRow({ content_profile_source_manifest_checksum: null }),
  ]) {
    const fetchCalls: { readonly input: string; readonly init?: RequestInit }[] = [];
    const handler = createStrongrDailyGenerateHandler({
      authorizeContentProfile: () => true,
      environment,
      fetch: successfulFetch(fetchCalls, [job]),
      runtimeFactory: () => ({
        runJobOnce() {
          runtimeCalls += 1;
          return Promise.resolve(succeededSummary);
        },
      }),
    });

    const response = await handler(request());
    const isPartial = job.content_profile_source_manifest_checksum === null;
    assert.equal(response.status, isPartial ? 404 : 409);
    assert.deepEqual(await response.json(), {
      error_code: isPartial ? "generation_job_not_found" : "content_profile_not_active",
    });
  }
  assert.equal(runtimeCalls, 0);
});

test("untrusted origins and malformed exact-job requests stop before authentication", async () => {
  let fetchCalls = 0;
  let runtimeCalls = 0;
  const handler = createStrongrDailyGenerateHandler({
    environment,
    fetch: async () => {
      fetchCalls += 1;
      return Response.json({});
    },
    runtimeFactory: () => ({
      runJobOnce() {
        runtimeCalls += 1;
        return Promise.resolve(succeededSummary);
      },
    }),
  });

  const wrongOrigin = await handler(request(undefined, { origin: "https://untrusted.example" }));
  const extraField = await handler(
    request({ generation_job_id: generationJobId, organization_id: organizationId }),
  );
  const wrongContentType = await handler(request(undefined, { contentType: "text/plain" }));
  const oversized = await handler(
    request({
      generation_job_id: generationJobId,
      padding: "x".repeat(4_096),
    }),
  );

  assert.equal(wrongOrigin.status, 403);
  assert.deepEqual(await wrongOrigin.json(), { error_code: "origin_not_allowed" });
  assert.equal(extraField.status, 400);
  assert.deepEqual(await extraField.json(), { error_code: "invalid_request" });
  assert.equal(wrongContentType.status, 415);
  assert.deepEqual(await wrongContentType.json(), { error_code: "content_type_not_allowed" });
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), { error_code: "request_too_large" });
  assert.equal(fetchCalls, 0);
  assert.equal(runtimeCalls, 0);
});

test("development allowlist rejects any other Supabase project before network or provider use", async () => {
  let fetchCalls = 0;
  let runtimeCalls = 0;
  const handler = createStrongrDailyGenerateHandler({
    environment: { ...environment, SUPABASE_URL: "https://production-example.supabase.co" },
    fetch: async () => {
      fetchCalls += 1;
      return Response.json({});
    },
    runtimeFactory: () => ({
      runJobOnce() {
        runtimeCalls += 1;
        return Promise.resolve(succeededSummary);
      },
    }),
  });

  const response = await handler(request());

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error_code: "development_project_not_allowed" });
  assert.equal(fetchCalls, 0);
  assert.equal(runtimeCalls, 0);
});

test("tenant permission and exact job visibility are required before provider use", async () => {
  let runtimeCalls = 0;
  const deniedHandler = createStrongrDailyGenerateHandler({
    environment,
    fetch: (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Promise.resolve(Response.json({ id: userId }));
      if (url.includes("/rest/v1/generation_jobs?")) {
        return Promise.resolve(Response.json([jobRow()]));
      }
      return Promise.resolve(Response.json(false));
    },
    runtimeFactory: () => ({
      runJobOnce() {
        runtimeCalls += 1;
        return Promise.resolve(succeededSummary);
      },
    }),
  });
  const invisibleCalls: { readonly input: string; readonly init?: RequestInit }[] = [];
  const invisibleHandler = createStrongrDailyGenerateHandler({
    environment,
    fetch: successfulFetch(invisibleCalls, []),
    runtimeFactory: () => ({
      runJobOnce() {
        runtimeCalls += 1;
        return Promise.resolve(succeededSummary);
      },
    }),
  });

  const denied = await deniedHandler(request());
  const invisible = await invisibleHandler(request());

  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error_code: "permission_denied" });
  assert.equal(invisible.status, 404);
  assert.deepEqual(await invisible.json(), { error_code: "generation_job_not_found" });
  assert.equal(runtimeCalls, 0);
});

test("only a fresh one-attempt job with the fixed prompt contract can call the provider", async () => {
  const cases = [
    jobRow({ attempt_count: 1 }),
    jobRow({ prompt_key: "strongr.strongr_daily.fixture" }),
    jobRow({ prompt_version: 2 }),
  ];
  let runtimeCalls = 0;
  for (const job of cases) {
    const fetchCalls: { readonly input: string; readonly init?: RequestInit }[] = [];
    const handler = createStrongrDailyGenerateHandler({
      environment,
      fetch: successfulFetch(fetchCalls, [job]),
      runtimeFactory: () => ({
        runJobOnce() {
          runtimeCalls += 1;
          return Promise.resolve(succeededSummary);
        },
      }),
    });

    const response = await handler(request());
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error_code: "generation_job_not_claimable" });
  }
  assert.equal(runtimeCalls, 0);
});

test("failed work requires an intentional new job and cannot be implicitly retried", async () => {
  let runtimeCalls = 0;
  const fetchCalls: { readonly input: string; readonly init?: RequestInit }[] = [];
  const handler = createStrongrDailyGenerateHandler({
    environment,
    fetch: successfulFetch(fetchCalls, [jobRow({ state: "failed" })], "failed"),
    runtimeFactory: () => ({
      runJobOnce() {
        runtimeCalls += 1;
        return Promise.resolve(succeededSummary);
      },
    }),
  });

  const response = await handler(request());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    content_version_id: null,
    error_code: "generation.provider_rejected",
    estimated_cost_microunits: null,
    generation_job_id: generationJobId,
    input_tokens: null,
    output_tokens: null,
    state: "failed",
  });
  assert.equal(runtimeCalls, 0);
});

test("provider/runtime exceptions return only a stable safe failure", async () => {
  const fetchCalls: { readonly input: string; readonly init?: RequestInit }[] = [];
  const privateDetail = `upstream ${openAiApiKey} ${serviceRoleKey}`;
  const handler = createStrongrDailyGenerateHandler({
    authorizeContentProfile: (selection, sourceManifestChecksum) =>
      selection.canonical_checksum === contentProfileSelectionFixture.canonical_checksum &&
      sourceManifestChecksum === strongrDailyContentProfileSourceManifestV1.canonical_checksum,
    environment,
    fetch: successfulFetch(fetchCalls),
    runtimeFactory: () => ({
      runJobOnce() {
        return Promise.reject(new Error(privateDetail));
      },
    }),
  });

  const response = await handler(request());
  const serialized = JSON.stringify(await response.json());

  assert.equal(response.status, 503);
  assert.equal(serialized, JSON.stringify({ error_code: "generation_service_unavailable" }));
  assert.doesNotMatch(serialized, new RegExp(openAiApiKey));
  assert.doesNotMatch(serialized, new RegExp(serviceRoleKey));
  assert.doesNotMatch(serialized, /upstream/);
});
