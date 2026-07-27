import assert from "node:assert/strict";
import test from "node:test";

import { createStudioAuthClient, studioAuthPolicy } from "../src/auth-client.ts";
import type { StudioEnvironment } from "../src/environment.ts";

const environment: StudioEnvironment = Object.freeze({
  supabasePublishableKey: "sb_publishable_fixture_123456",
  supabaseUrl: "https://example.supabase.co",
});

test("Studio Auth boundary is PKCE-only and exposes supported MFA operations", () => {
  assert.deepEqual(studioAuthPolicy, {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    persistSession: true,
  });

  const client = createStudioAuthClient(environment);
  assert.equal(typeof client.getSession, "function");
  assert.equal(typeof client.mfa.getAuthenticatorAssuranceLevel, "function");
});
