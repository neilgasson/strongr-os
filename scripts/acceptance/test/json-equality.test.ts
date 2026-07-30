import assert from "node:assert/strict";
import test from "node:test";
import { deepEqualJson } from "../json-equality.ts";

test("JSON equality ignores PostgreSQL JSONB object-key ordering", () => {
  assert.equal(
    deepEqualJson(
      {
        schema_id: "strongr.strongr_daily_audio_reflection_brief.v2",
        scripture_reference: { reference: "Psalm 46:10", translation: "KJV" },
        working_title: "Be Still Today",
      },
      {
        working_title: "Be Still Today",
        scripture_reference: { translation: "KJV", reference: "Psalm 46:10" },
        schema_id: "strongr.strongr_daily_audio_reflection_brief.v2",
      },
    ),
    true,
  );
});

test("JSON equality preserves array ordering", () => {
  assert.equal(
    deepEqualJson(
      { required_elements: ["welcome", "prayer"] },
      { required_elements: ["prayer", "welcome"] },
    ),
    false,
  );
});
