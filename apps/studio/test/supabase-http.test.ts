import assert from "node:assert/strict";
import test from "node:test";

import { createStudioSupabaseGateway, StudioApiError } from "../src/index.ts";
import type { StudioEnvironment } from "../src/index.ts";

const organizationId = "00000000-0000-4000-8000-000000000001";
const contentItemId = "00000000-0000-4000-8000-000000000002";
const briefId = "00000000-0000-4000-8000-000000000003";
const jobId = "00000000-0000-4000-8000-000000000004";
const versionId = "00000000-0000-4000-8000-000000000005";
const correlationId = "00000000-0000-4000-8000-000000000006";
const hash = "a".repeat(64);

const environment: StudioEnvironment = Object.freeze({
  supabasePublishableKey: "sb_publishable_fixture_123456",
  supabaseUrl: "https://example.supabase.co",
});

test("authenticated commands use the publishable key, user bearer token, and exact RPC body", async () => {
  const requests: { readonly input: string; readonly init?: RequestInit }[] = [];
  const gateway = createStudioSupabaseGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch(input, init) {
      requests.push({ input: String(input), ...(init ? { init } : {}) });
      return Promise.resolve(
        Response.json([{ brief_id: briefId, content_item_id: contentItemId }]),
      );
    },
  });

  const result = await gateway.invoke("m1_create_audio_brief", {
    correlationId,
    organizationId,
    payload: { schema_id: "strongr.audio_reflection_brief.v1" },
    title: "Synthetic brief",
  });

  assert.deepEqual(result, { briefId, contentItemId });
  assert.equal(requests[0]?.input, "https://example.supabase.co/rest/v1/rpc/m1_create_audio_brief");
  const headers = requests[0]?.init?.headers as Readonly<Record<string, string>>;
  assert.equal(headers.apikey, environment.supabasePublishableKey);
  assert.equal(headers.authorization, "Bearer authenticated-user-jwt");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    p_correlation_id: correlationId,
    p_organization_id: organizationId,
    p_payload: { schema_id: "strongr.audio_reflection_brief.v1" },
    p_title: "Synthetic brief",
  });
});

test("tenant reads are explicitly filtered, bounded, ordered, and contract parsed", async () => {
  const requestedUrls: string[] = [];
  const gateway = createStudioSupabaseGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch(input) {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("/content_briefs?")) {
        return Promise.resolve(
          Response.json([
            {
              content_item_id: contentItemId,
              created_at: "2026-07-26T20:00:00Z",
              id: briefId,
              organization_id: organizationId,
              payload_hash: hash,
              schema_id: "strongr.audio_reflection_brief.v1",
            },
          ]),
        );
      }
      if (url.includes("/generation_jobs?")) {
        return Promise.resolve(
          Response.json([
            {
              attempt_count: 1,
              brief_id: briefId,
              created_at: "2026-07-26T20:01:00Z",
              finished_at: "2026-07-26T20:02:00Z",
              id: jobId,
              organization_id: organizationId,
              output_hash: hash,
              state: "succeeded",
            },
          ]),
        );
      }
      return Promise.resolve(
        Response.json([
          {
            brief_id: briefId,
            content_item_id: contentItemId,
            created_at: "2026-07-26T20:02:00Z",
            id: versionId,
            organization_id: organizationId,
            payload: { schema_id: "strongr.audio_reflection.v1" },
            payload_hash: hash,
            schema_id: "strongr.audio_reflection.v1",
            source: "ai_assisted",
            source_job_id: jobId,
            state: "draft",
            submitted_at: null,
            version_number: 1,
          },
        ]),
      );
    },
  });

  const [briefs, jobs, versions] = await Promise.all([
    gateway.listBriefs(organizationId, 25),
    gateway.listGenerationJobs(organizationId, 25),
    gateway.listContentVersions(organizationId, 25),
  ]);

  assert.equal(briefs[0]?.id, briefId);
  assert.equal(jobs[0]?.state, "succeeded");
  assert.equal(versions[0]?.sourceJobId, jobId);
  for (const requestedUrl of requestedUrls) {
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get("organization_id"), `eq.${organizationId}`);
    assert.equal(url.searchParams.get("limit"), "25");
    assert.equal(url.searchParams.get("order"), "created_at.desc,id.desc");
    assert.equal(url.searchParams.has("offset"), false);
  }
});

test("API errors expose only status and machine code and mutating calls are not retried", async () => {
  let attempts = 0;
  const gateway = createStudioSupabaseGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch() {
      attempts += 1;
      return Promise.resolve(
        Response.json(
          {
            code: "42501",
            message: "private database detail that must not reach the operator",
          },
          { status: 403 },
        ),
      );
    },
  });

  await assert.rejects(
    () =>
      gateway.invoke("m1_submit_version", {
        contentVersionId: versionId,
        correlationId,
        organizationId,
      }),
    (error: unknown) => {
      assert.ok(error instanceof StudioApiError);
      assert.equal(error.status, 403);
      assert.equal(error.code, "42501");
      assert.doesNotMatch(error.message, /private database detail/);
      return true;
    },
  );
  assert.equal(attempts, 1);
});

test("service or publishable keys cannot be used as user access tokens", () => {
  const privilegedKey = ["sb", "secret", "must-not-enter-browser"].join("_");
  assert.throws(
    () =>
      createStudioSupabaseGateway({
        accessToken: privilegedKey,
        environment,
      }),
    /authenticated user access token/,
  );
});
