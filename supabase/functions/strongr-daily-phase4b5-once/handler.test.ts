import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createStrongrDailyV2FixtureOutput } from "../../../packages/ai/src/index.ts";
import {
  guidedAudioReflectionV1Proposal,
  guidedAudioReflectionV1ProposalSourceManifestV2,
} from "../../../packages/content-profiles/src/guided-audio-reflection-v1-proposal.ts";
import { strongrDailyAudioReflectionV2BriefFixture } from "../../../packages/testing/src/index.ts";
import {
  createStrongrDailyPhase4b5OnceHandler,
  strongrDailyPhase4b5Boundary,
  type Phase4b5Fetch,
} from "./handler.ts";

const organizationId = "52000000-0000-4000-8000-000000000001";
const briefId = "52000000-0000-4000-8000-000000000002";
const authorizationId = "52000000-0000-4000-8000-000000000003";
const correlationId = "52000000-0000-4000-8000-000000000005";
const userId = "52000000-0000-4000-8000-000000000004";
const token = `user_${"x".repeat(48)}`;
const secret = `sk-${"p".repeat(48)}`;
const service = `sb_secret_${"s".repeat(48)}`;

const profile = Object.freeze({
  canonical_checksum: guidedAudioReflectionV1Proposal.canonical_checksum,
  content_type: "audio_reflection",
  profile_id: "guided_audio_reflection",
  profile_version: 1,
});
const brief = Object.freeze({
  ...strongrDailyAudioReflectionV2BriefFixture,
  content_profile: profile,
});
const environment = Object.freeze({
  OPENAI_API_KEY: secret,
  SUPABASE_ANON_KEY: `anon_${"a".repeat(40)}`,
  SUPABASE_SERVICE_ROLE_KEY: service,
  SUPABASE_URL: strongrDailyPhase4b5Boundary.supabaseUrl,
});

function request(): Request {
  return new Request("https://edge.example.test/strongr-daily-phase4b5-once", {
    body: JSON.stringify({ brief_id: briefId, organization_id: organizationId }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: strongrDailyPhase4b5Boundary.allowedOrigin,
    },
    method: "POST",
  });
}

function successfulFetch(calls: string[]): Phase4b5Fetch {
  return (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) return Promise.resolve(Response.json({ id: userId }));
    if (url.includes("/rest/v1/content_briefs?")) {
      return Promise.resolve(
        Response.json([
          {
            content_profile_checksum: profile.canonical_checksum,
            content_profile_content_type: profile.content_type,
            content_profile_id: profile.profile_id,
            content_profile_source_manifest_checksum:
              guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
            content_profile_version: profile.profile_version,
            id: briefId,
            organization_id: organizationId,
            payload: brief,
            payload_hash: "a".repeat(64),
            schema_id: brief.schema_id,
          },
        ]),
      );
    }
    if (url.endsWith("/rest/v1/rpc/m1_begin_phase4b5_one_call")) {
      return Promise.resolve(Response.json({ authorization_id: authorizationId, correlation_id: correlationId }));
    }
    if (url === "https://api.openai.com/v1/responses") {
      return Promise.resolve(
        Response.json({
          id: "resp_phase4b5_test",
          model: "gpt-5.6-terra",
          output_text: JSON.stringify(createStrongrDailyV2FixtureOutput(brief)),
          usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
        }),
      );
    }
    if (url.endsWith("/rest/v1/rpc/m1_complete_phase4b5_one_call")) {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    throw new Error("unexpected fetch");
  };
}

test("Phase 4B.5 keeps JWT verification enabled", async () => {
  const config = await readFile(new URL("../../config.toml", import.meta.url), "utf8");
  assert.match(
    config,
    /\[functions\.strongr-daily-phase4b5-once\]\s+verify_jwt\s*=\s*true(?:\s|$)/,
  );
});

test("one eligible request makes one provider call then returns only quarantine-safe evidence", async () => {
  const calls: string[] = [];
  const handler = createStrongrDailyPhase4b5OnceHandler({
    environment,
    fetch: successfulFetch(calls),
  });
  const result = await handler(request());
  const body = (await result.json()) as Record<string, unknown>;

  assert.equal(result.status, 200);
  assert.deepEqual(body, {
    actual_cost_microunits: 3313,
    authorization_id: authorizationId,
    correlation_id: correlationId,
    error_code: null,
    model: "gpt-5.6-terra",
    output_tokens: 200,
    pre_call_estimate_microunits: body.pre_call_estimate_microunits,
    request_sha256: body.request_sha256,
    state: "quarantined",
  });
  assert.equal(calls.filter((value) => value === "https://api.openai.com/v1/responses").length, 1);
  assert.match(String(body.request_sha256), /^[a-f0-9]{64}$/);
  const serialized = JSON.stringify({ body, calls });
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.doesNotMatch(serialized, new RegExp(service));
  assert.doesNotMatch(serialized, new RegExp(token));
  assert.doesNotMatch(serialized, /narration_text|warm_welcome|quarantined_payload/);
});

test("the exact request hash is persisted before the provider boundary and bound at completion", async () => {
  let beginPayload: Record<string, unknown> | null = null;
  let completionPayload: Record<string, unknown> | null = null;
  let providerSawPersistedHash = false;
  const fetch: Phase4b5Fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: userId });
    if (url.includes("/rest/v1/content_briefs?")) {
      return Response.json([
        {
          content_profile_checksum: profile.canonical_checksum,
          content_profile_content_type: profile.content_type,
          content_profile_id: profile.profile_id,
          content_profile_source_manifest_checksum:
            guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
          content_profile_version: profile.profile_version,
          id: briefId,
          organization_id: organizationId,
          payload: brief,
          payload_hash: "a".repeat(64),
          schema_id: brief.schema_id,
        },
      ]);
    }
    if (url.endsWith("/rest/v1/rpc/m1_begin_phase4b5_one_call")) {
      beginPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ authorization_id: authorizationId, correlation_id: correlationId });
    }
    if (url === "https://api.openai.com/v1/responses") {
      providerSawPersistedHash = typeof beginPayload?.p_request_sha256 === "string";
      return Response.json({
        id: "resp_phase4b5_hash_test",
        model: "gpt-5.6-terra",
        output_text: JSON.stringify(createStrongrDailyV2FixtureOutput(brief)),
        usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
      });
    }
    if (url.endsWith("/rest/v1/rpc/m1_complete_phase4b5_one_call")) {
      completionPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(null, { status: 204 });
    }
    throw new Error("unexpected fetch");
  };

  const response = await createStrongrDailyPhase4b5OnceHandler({ environment, fetch })(request());
  assert.equal(response.status, 200);
  assert.equal(providerSawPersistedHash, true);
  assert.equal(beginPayload?.p_estimated_input_tokens, beginPayload?.p_canonical_request_byte_count);
  assert.equal(beginPayload?.p_price_schedule_version, "openai.responses.gpt-5.6-terra.2026-08-01.v1");
  assert.match(String(beginPayload?.p_request_sha256), /^[a-f0-9]{64}$/);
  assert.equal(completionPayload?.p_request_sha256, beginPayload?.p_request_sha256);
  assert.equal(completionPayload?.p_correlation_id, correlationId);
});

test("a consumed authorization fails before any provider request", async () => {
  const calls: string[] = [];
  const fetch: Phase4b5Fetch = (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) return Promise.resolve(Response.json({ id: userId }));
    if (url.includes("/rest/v1/content_briefs?")) {
      return successfulFetch([])(input, init);
    }
    if (url.endsWith("/rest/v1/rpc/m1_begin_phase4b5_one_call")) {
      return Promise.resolve(Response.json({ code: "55000" }, { status: 409 }));
    }
    throw new Error("provider must not be called");
  };
  const response = await createStrongrDailyPhase4b5OnceHandler({ environment, fetch })(request());
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error_code: "generation_already_consumed" });
  assert.equal(calls.filter((value) => value === "https://api.openai.com/v1/responses").length, 0);
});
