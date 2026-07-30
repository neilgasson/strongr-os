import assert from "node:assert/strict";
import test from "node:test";

import type { StrongrDailyAudioReflectionV2Brief } from "../../content-schemas/src/index.ts";
import {
  createOpenAiStrongrDailyV2Adapter,
  createStrongrDailyV2FixtureOutput,
  deterministicGenerationAdapter,
  GenerationProviderError,
  type GenerationRequest,
} from "../src/index.ts";
import { createGenerationRequestFixture, fixtureIds } from "../../testing/src/index.ts";

const strongrDailyV2Brief: StrongrDailyAudioReflectionV2Brief = Object.freeze({
  audience: "Christian adults seeking a grounded daily reflection",
  content_type: "audio_reflection",
  desired_duration_seconds: 300,
  pastoral_purpose: "Offer a faithful next step rooted in Scripture.",
  prohibited_claims_or_wording: ["guaranteed outcome"],
  required_elements: ["welcome", "Scripture", "prayer", "takeaway"],
  schema_id: "strongr.strongr_daily_audio_reflection_brief.v2",
  scripture_reference: {
    reference: "Psalm 46:10",
    source_citation: "Psalm 46:10",
    translation: "NIV",
  },
  source_brief_identifier: "phase-3-provider-fixture",
  theme: "quiet trust",
  tone: "pastoral",
  working_title: "Quiet Trust",
});

const strongrDailyV2Request: GenerationRequest = Object.freeze({
  brief: strongrDailyV2Brief,
  correlationId: fixtureIds.correlationId,
  generationJobId: fixtureIds.generationJobId,
  organizationId: fixtureIds.organizationAlphaId,
  promptKey: "strongr.daily.v2",
  promptVersion: 1,
});

test("deterministic generation returns identical provenance for an exact replay", async () => {
  const request = createGenerationRequestFixture();

  const first = await deterministicGenerationAdapter.generate(request);
  const replay = await deterministicGenerationAdapter.generate(request);

  assert.deepEqual(first, replay);
  assert.equal(first.provider, "deterministic-test");
  assert.equal(first.responseSchemaId, "strongr.audio_reflection.v1");
  assert.match(first.outputHash, /^[a-f0-9]{64}$/);
});

test("generation output hash matches the PostgreSQL jsonb evidence contract", async () => {
  const result = await deterministicGenerationAdapter.generate(createGenerationRequestFixture());

  assert.equal(
    result.outputHash,
    "98ca50f09be947c329f4224640989b19f0bc83fe059c07ed71ae8455f1641425",
  );
});

test("changed prompt provenance changes the deterministic result identity", async () => {
  const first = await deterministicGenerationAdapter.generate(createGenerationRequestFixture());
  const changed = await deterministicGenerationAdapter.generate(
    createGenerationRequestFixture({ promptVersion: 2 }),
  );

  assert.notEqual(first.promptChecksum, changed.promptChecksum);
  assert.notEqual(first.providerResponseId, changed.providerResponseId);
});

test("deterministic generation covers every Strongr Daily v2 field as a draft", async () => {
  const result = await deterministicGenerationAdapter.generate(strongrDailyV2Request);

  assert.equal(result.responseSchemaId, "strongr.strongr_daily_audio_reflection.v2");
  if (result.output.schema_id !== "strongr.strongr_daily_audio_reflection.v2") {
    assert.fail("Expected v2 output");
  }
  assert.equal(result.output.content_hash, result.outputHash);
});

test("OpenAI provider requests strict v2 JSON and preserves only safe usage evidence", async () => {
  const fixture = createStrongrDailyV2FixtureOutput(strongrDailyV2Brief);
  const { content_hash: _contentHash, ...providerOutput } = fixture;
  const calls: Array<{ body: string; headers: Readonly<Record<string, string>> }> = [];
  const apiKey = "sk_phase3_provider_fixture_1234567890";
  const adapter = createOpenAiStrongrDailyV2Adapter({
    apiKey,
    fetch: async (_url, init) => {
      calls.push({ body: init.body, headers: init.headers });
      return {
        json: async () => ({
          id: "resp_phase3_fixture",
          output_text: JSON.stringify(providerOutput),
          usage: { input_tokens: 123, output_tokens: 456, total_tokens: 579 },
        }),
        ok: true,
        status: 200,
      };
    },
    model: "gpt-4o-mini",
  });

  const result = await adapter.generate(strongrDailyV2Request);

  assert.equal(calls.length, 1);
  assert.equal(result.responseSchemaId, "strongr.strongr_daily_audio_reflection.v2");
  assert.deepEqual(result.usage, { inputTokens: 123, outputTokens: 456, totalTokens: 579 });
  if (result.output.schema_id !== "strongr.strongr_daily_audio_reflection.v2") {
    assert.fail("Expected v2 output");
  }
  assert.equal(result.output.content_hash, result.outputHash);
  assert.match(calls[0]?.body ?? "", /json_schema/);
  assert.doesNotMatch(calls[0]?.body ?? "", new RegExp(apiKey));
});

test("OpenAI provider failures never include credentials or source content", async () => {
  const apiKey = "sk_phase3_provider_fixture_1234567890";
  const adapter = createOpenAiStrongrDailyV2Adapter({
    apiKey,
    fetch: async () => ({
      json: async () => ({ error: { message: "not returned to workers" } }),
      ok: false,
      status: 401,
    }),
    model: "gpt-4o-mini",
  });

  await assert.rejects(
    () => adapter.generate(strongrDailyV2Request),
    (error: unknown) => {
      assert.ok(error instanceof GenerationProviderError);
      assert.equal(error.safeCode, "generation.provider_authentication_failed");
      assert.doesNotMatch(String(error), new RegExp(apiKey));
      assert.doesNotMatch(String(error), /quiet trust/i);
      return true;
    },
  );
});
