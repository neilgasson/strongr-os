import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationRequestFixture,
  strongrDailyAudioReflectionV2BriefFixture,
} from "../../testing/src/index.ts";
import {
  createOpenAiStrongrDailyV2Adapter,
  createStrongrDailyV2FixtureOutput,
  GenerationProviderError,
  type OpenAiFetch,
} from "../src/index.ts";

const providerKeyFixture = "sk_provider_fixture_12345678901234567890";

function requestFixture() {
  return createGenerationRequestFixture({
    brief: strongrDailyAudioReflectionV2BriefFixture,
    promptKey: "strongr.daily.v2",
  });
}

test("OpenAI adapter requests strict v2 draft output and returns only safe provenance", async () => {
  let capturedHeaders: Readonly<Record<string, string>> | undefined;
  let capturedBody: string | undefined;
  const fetch: OpenAiFetch = async (_url, init) => {
    capturedHeaders = init.headers;
    capturedBody = init.body;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "resp_provider_fixture_1",
        output_text: JSON.stringify(
          createStrongrDailyV2FixtureOutput(strongrDailyAudioReflectionV2BriefFixture),
        ),
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      }),
    };
  };
  const adapter = createOpenAiStrongrDailyV2Adapter({
    apiKey: providerKeyFixture,
    fetch,
    model: "gpt-4o-mini",
  });

  const result = await adapter.generate(requestFixture());

  assert.equal(result.provider, "openai");
  assert.equal(result.responseSchemaId, "strongr.strongr_daily_audio_reflection.v2");
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 20, totalTokens: 30 });
  assert.match(capturedHeaders?.Authorization ?? "", /^Bearer sk_provider_fixture_/);
  assert.match(capturedBody ?? "", /"strict":true/);
  assert.match(capturedBody ?? "", /draft only/);
  assert.doesNotMatch(capturedBody ?? "", /approved/);
});

test("OpenAI adapter exposes safe provider failures without echoing the API key", async () => {
  const adapter = createOpenAiStrongrDailyV2Adapter({
    apiKey: providerKeyFixture,
    fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    model: "gpt-4o-mini",
  });

  await assert.rejects(adapter.generate(requestFixture()), (error: unknown) => {
    assert.ok(error instanceof GenerationProviderError);
    assert.equal(error.safeCode, "generation.provider_authentication_failed");
    assert.doesNotMatch(String(error), new RegExp(providerKeyFixture));
    return true;
  });
});
