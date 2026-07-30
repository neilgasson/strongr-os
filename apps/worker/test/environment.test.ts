import assert from "node:assert/strict";
import test from "node:test";

import { loadWorkerEnvironment } from "../src/environment.ts";

test("Worker accepts one server-only Supabase secret", () => {
  const environment = loadWorkerEnvironment({
    STRONGR_OS_SUPABASE_URL: "https://example.supabase.co/",
    STRONGR_OS_SUPABASE_SECRET_KEY: "sb_secret_worker_fixture_123456",
    STRONGR_OS_WORKER_ID: "m1-worker-1",
  });

  assert.equal(environment.supabaseUrl, "https://example.supabase.co");
  assert.equal(environment.privilegedKeyKind, "secret");
  assert.equal(environment.workerId, "m1-worker-1");
  assert.equal(environment.generationProvider, "deterministic");
  assert.equal(environment.openAiApiKey, null);
});

test("Worker enables OpenAI only with explicit server-only configuration", () => {
  const environment = loadWorkerEnvironment({
    STRONGR_OS_GENERATION_PROVIDER: "openai",
    STRONGR_OS_OPENAI_API_KEY: "sk_phase3_provider_fixture_1234567890",
    STRONGR_OS_OPENAI_MODEL: "gpt-4o-mini",
    STRONGR_OS_SUPABASE_URL: "https://example.supabase.co",
    STRONGR_OS_SUPABASE_SECRET_KEY: "sb_secret_worker_fixture_123456",
    STRONGR_OS_WORKER_ID: "m1-worker-1",
  });

  assert.equal(environment.generationProvider, "openai");
  assert.equal(environment.openAiModel, "gpt-4o-mini");
  assert.doesNotMatch(JSON.stringify({
    generationProvider: environment.generationProvider,
    openAiModel: environment.openAiModel,
  }), /sk_phase3_provider_fixture/);
});

test("Worker rejects privileged values under public names", () => {
  assert.throws(
    () =>
      loadWorkerEnvironment({
        STRONGR_OS_SUPABASE_URL: "https://example.supabase.co",
        STRONGR_OS_SUPABASE_SECRET_KEY: "sb_secret_worker_fixture_123456",
        STRONGR_OS_WORKER_ID: "m1-worker-1",
        PUBLIC_SUPABASE_SECRET_KEY: "must-not-ship",
      }),
    /public environment names/,
  );
  assert.throws(
    () =>
      loadWorkerEnvironment({
        PUBLIC_OPENAI_API_KEY: "must-not-ship",
        STRONGR_OS_GENERATION_PROVIDER: "openai",
        STRONGR_OS_OPENAI_API_KEY: "sk_phase3_provider_fixture_1234567890",
        STRONGR_OS_OPENAI_MODEL: "gpt-4o-mini",
        STRONGR_OS_SUPABASE_URL: "https://example.supabase.co",
        STRONGR_OS_SUPABASE_SECRET_KEY: "sb_secret_worker_fixture_123456",
        STRONGR_OS_WORKER_ID: "m1-worker-1",
      }),
    /public environment names/,
  );
});

test("Worker rejects ambiguous privileged credentials", () => {
  assert.throws(
    () =>
      loadWorkerEnvironment({
        STRONGR_OS_SUPABASE_URL: "https://example.supabase.co",
        STRONGR_OS_SUPABASE_SECRET_KEY: "sb_secret_worker_fixture_123456",
        STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
        STRONGR_OS_WORKER_ID: "m1-worker-1",
      }),
    /exactly one/,
  );
});

test("Worker does not select OpenAI without a model and server-only key", () => {
  assert.throws(
    () =>
      loadWorkerEnvironment({
        STRONGR_OS_GENERATION_PROVIDER: "openai",
        STRONGR_OS_SUPABASE_URL: "https://example.supabase.co",
        STRONGR_OS_SUPABASE_SECRET_KEY: "sb_secret_worker_fixture_123456",
        STRONGR_OS_WORKER_ID: "m1-worker-1",
      }),
    /STRONGR_OS_OPENAI_API_KEY/,
  );
});
