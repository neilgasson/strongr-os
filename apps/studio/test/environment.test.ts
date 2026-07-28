import assert from "node:assert/strict";
import test from "node:test";

import { loadBrowserEnvironment } from "../src/browser-environment.ts";
import { loadStudioEnvironment } from "../src/environment.ts";

test("Studio exposes only the public Supabase boundary", () => {
  const environment = loadStudioEnvironment({
    PUBLIC_SUPABASE_URL: "https://example.supabase.co/",
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_123456",
    PRIVATE_BACKEND_CREDENTIAL: "must-not-ship",
  });

  assert.deepEqual(environment, {
    supabaseUrl: "https://example.supabase.co",
    supabasePublishableKey: "sb_publishable_fixture_123456",
  });
  assert.equal(JSON.stringify(environment).includes("must-not-ship"), false);
});

test("Studio rejects non-publishable keys", () => {
  assert.throws(
    () =>
      loadStudioEnvironment({
        PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: "not-a-public-key",
      }),
    /publishable key/,
  );
});

test("Studio rejects unreviewed public browser values", () => {
  assert.throws(
    () =>
      loadStudioEnvironment({
        PUBLIC_ANALYTICS_TOKEN: "unreviewed-browser-value",
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_123456",
        PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    /Unsupported public Studio environment value: PUBLIC_ANALYTICS_TOKEN/,
  );
});

test("Studio loads the hosted preview boundary from same-origin runtime configuration", async () => {
  const state = await loadBrowserEnvironment({}, async (input, init) => {
    assert.equal(input, "/runtime-config.json");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.credentials, "same-origin");
    return Response.json({
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_123456",
      PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    });
  });

  assert.deepEqual(state, {
    status: "configured",
    value: {
      supabasePublishableKey: "sb_publishable_fixture_123456",
      supabaseUrl: "https://example.supabase.co",
    },
  });
});

test("Studio fails closed when hosted runtime configuration is unavailable", async () => {
  const state = await loadBrowserEnvironment({}, async () => {
    throw new Error("network unavailable");
  });

  assert.deepEqual(state, { status: "unconfigured" });
});
