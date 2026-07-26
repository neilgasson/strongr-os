import assert from "node:assert/strict";
import test from "node:test";

import { audioReflectionBriefFixture } from "../../testing/src/index.ts";
import { parseAudioReflection, parseAudioReflectionBrief } from "../src/audio-reflection.ts";

test("the golden brief satisfies the strict runtime schema", () => {
  assert.deepEqual(
    parseAudioReflectionBrief(audioReflectionBriefFixture),
    audioReflectionBriefFixture,
  );
});

test("brief schemas reject unknown fields", () => {
  assert.throws(() =>
    parseAudioReflectionBrief({
      ...audioReflectionBriefFixture,
      unreviewed_private_context: "must not be accepted",
    }),
  );
});

test("content schemas reject incomplete drafts", () => {
  assert.throws(() =>
    parseAudioReflection({
      schema_id: "strongr.audio_reflection.v1",
      title: "Incomplete fixture",
    }),
  );
});
