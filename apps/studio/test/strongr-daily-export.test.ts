import assert from "node:assert/strict";
import test from "node:test";

import { createStrongrDailyV2FixtureOutput } from "../../../packages/ai/src/deterministic-adapter.ts";
import {
  fixtureIds,
  strongrDailyAudioReflectionV2BriefFixture,
} from "../../../packages/testing/src/index.ts";
import { createStrongrDailyApprovedExport } from "../src/strongr-daily-export.ts";

const ids = {
  approval: "00000000-0000-4000-8000-000000000020",
  package: "00000000-0000-4000-8000-000000000023",
};

async function productionPackage() {
  const generated = createStrongrDailyV2FixtureOutput(strongrDailyAudioReflectionV2BriefFixture);
  return {
    approvalSnapshotId: ids.approval,
    createdAt: "2026-07-28T12:00:00Z",
    id: ids.package,
    manifest: {
      approval_snapshot_id: ids.approval,
      check_result_ids: ["00000000-0000-4000-8000-000000000031"],
      check_run_id: "00000000-0000-4000-8000-000000000021",
      content: generated,
      content_payload_hash: "a".repeat(64),
      content_schema_id: generated.schema_id,
      evidence_bundle_hash: "b".repeat(64),
      review_decision_ids: ["00000000-0000-4000-8000-000000000022"],
      review_policy_id: "00000000-0000-4000-8000-000000000024",
      rights_snapshot_id: "00000000-0000-4000-8000-000000000026",
      schema_id: "strongr.production_package.v1",
      scripture_evidence_id: "00000000-0000-4000-8000-000000000027",
    },
    manifestHash: "c".repeat(64),
    manifestSchemaId: "strongr.production_package.v1" as const,
    organizationId: fixtureIds.organizationAlphaId,
  };
}

test("v2 export is an exact approved-package projection with no publication action", async () => {
  const files = await createStrongrDailyApprovedExport({
    exportedAt: "2026-07-28T12:34:56Z",
    productionPackage: await productionPackage(),
  });
  const json = JSON.parse(files.json);
  assert.equal(json.publication_status, "manual_upload_required");
  assert.equal(json.content.prayer.includes("Lord"), true);
  assert.equal(json.content.app_description.length > 0, true);
  assert.equal(json.content.narration_text.length > 0, true);
  assert.equal(json.content.personal_takeaway_prompt.length > 0, true);
  assert.equal(json.content.artwork_generation_prompt.length > 0, true);
  assert.equal(json.content.social_caption.length > 0, true);
  assert.match(files.markdown, /Manual upload required/);
  assert.match(files.markdown, /## Prayer/);
});

test("v2 export rejects a changed reviewed field instead of silently exporting it", async () => {
  const package_ = await productionPackage();
  const content = package_.manifest.content as Record<string, unknown>;
  content.prayer = "Changed after review.";
  await assert.rejects(
    async () =>
      createStrongrDailyApprovedExport({
        exportedAt: "2026-07-28T12:34:56Z",
        productionPackage: package_,
      }),
    /approved content hash does not match payload/,
  );
});
  
