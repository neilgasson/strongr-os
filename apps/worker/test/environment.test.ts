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
