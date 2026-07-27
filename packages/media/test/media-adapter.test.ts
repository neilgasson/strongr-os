import assert from "node:assert/strict";
import test from "node:test";

import {
  createSyntheticPcmWav,
  deterministicMediaAdapter,
  MediaValidationError,
  syntheticAudioOutputSpec,
  validatePcmWav,
} from "../src/index.ts";

const request = Object.freeze({
  correlationId: "26000000-0000-4000-8000-000000000006",
  inputHash: "a".repeat(64),
  mediaJobId: "26000000-0000-4000-8000-000000000003",
  organizationId: "26000000-0000-4000-8000-000000000001",
  outputSpecId: "20000000-0000-4000-8000-000000000001",
  productionPackageId: "26000000-0000-4000-8000-000000000002",
});

test("deterministic adapter returns stable provider-neutral bytes and provenance", async () => {
  const first = await deterministicMediaAdapter.generate(request);
  const second = await deterministicMediaAdapter.generate(request);

  assert.deepEqual(first, second);
  assert.equal(first.costMicrounits, 0);
  assert.match(first.providerNeutralCorrelationId, /^synthetic-[a-f0-9]{32}$/);
  assert.deepEqual(first.bytes, createSyntheticPcmWav());
});

test("validator proves the exact approved PCM WAV specification", () => {
  const result = validatePcmWav(createSyntheticPcmWav(), syntheticAudioOutputSpec);

  assert.deepEqual(result, {
    bitsPerSample: 16,
    byteCount: 3_244,
    channels: 1,
    codec: "pcm_s16le",
    container: "wav",
    durationMs: 100,
    mimeType: "audio/wav",
    sampleRateHz: 16_000,
    sha256: "2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd",
    validationSchemaId: "strongr.media_validation.v1",
  });
});

test("validator rejects altered structure, format, size, and duration", () => {
  const structure = createSyntheticPcmWav();
  structure[0] = 0;
  assert.throws(
    () => validatePcmWav(structure, syntheticAudioOutputSpec),
    (error: unknown) =>
      error instanceof MediaValidationError && error.code === "media.wav_structure_invalid",
  );

  const spec = createSyntheticPcmWav();
  new DataView(spec.buffer).setUint32(24, 44_100, true);
  assert.throws(
    () => validatePcmWav(spec, syntheticAudioOutputSpec),
    (error: unknown) =>
      error instanceof MediaValidationError && error.code === "media.wav_spec_mismatch",
  );

  assert.throws(
    () =>
      validatePcmWav(createSyntheticPcmWav(), {
        ...syntheticAudioOutputSpec,
        maxBytes: 100,
      }),
    (error: unknown) =>
      error instanceof MediaValidationError && error.code === "media.byte_count_invalid",
  );

  assert.throws(
    () =>
      validatePcmWav(createSyntheticPcmWav(), {
        ...syntheticAudioOutputSpec,
        maxDurationMs: 99,
      }),
    (error: unknown) =>
      error instanceof MediaValidationError && error.code === "media.duration_invalid",
  );
});
