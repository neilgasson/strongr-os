import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createSyntheticPcmWavFixture,
  mediaFixtureIds,
  syntheticAudioFixture,
} from "../src/media-fixtures.ts";

test("the M2.0 synthetic WAV fixture is deterministic and contract-bound", () => {
  const first = createSyntheticPcmWavFixture();
  const second = createSyntheticPcmWavFixture();

  assert.deepEqual(first, second);
  assert.equal(first.byteLength, 3_244);
  assert.equal(Buffer.from(first.subarray(0, 4)).toString("ascii"), "RIFF");
  assert.equal(Buffer.from(first.subarray(8, 12)).toString("ascii"), "WAVE");
  assert.equal(Buffer.from(first.subarray(36, 40)).toString("ascii"), "data");
  assert.equal(createHash("sha256").update(first).digest("hex"), syntheticAudioFixture.sha256);
  assert.equal(
    syntheticAudioFixture.objectPath,
    `${mediaFixtureIds.organizationId}/${mediaFixtureIds.productionPackageId}/${mediaFixtureIds.artifactId}.wav`,
  );
  assert.equal(syntheticAudioFixture.bucketId, "strongr-os-media");
});
