import assert from "node:assert/strict";
import test from "node:test";

import { createGenerationRequestFixture } from "../../testing/src/index.ts";
import { deterministicGenerationAdapter } from "../src/index.ts";

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
