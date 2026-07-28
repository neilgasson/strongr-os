import { createGenerationOutputHash } from "../../../packages/ai/src/index.ts";
import {
  parseStrongrDailyAudioReflectionV2,
  type StrongrDailyAudioReflectionV2,
} from "../../../packages/content-schemas/src/index.ts";
import type { JsonObject, TenantProductionPackageSummary, Uuid } from "../../../packages/contracts/src/index.ts";

export interface StrongrDailyApprovedExport {
  readonly schema_id: "strongr.strongr_daily_export.v1";
  readonly publication_status: "manual_upload_required";
  readonly package_id: Uuid;
  readonly approval_snapshot_id: Uuid;
  readonly source_brief_identifier: string;
  readonly content_payload_hash: string;
  readonly approved_content_hash: string;
  readonly approval_evidence: JsonObject;
  readonly exported_at: string;
  readonly content: StrongrDailyAudioReflectionV2;
}

export interface StrongrDailyExportFiles {
  readonly json: string;
  readonly markdown: string;
}

function requireObject(value: unknown, name: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value as JsonObject;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is invalid`);
  return value;
}

function approvedExport(input: {
  readonly productionPackage: TenantProductionPackageSummary;
  readonly exportedAt: string;
}): StrongrDailyApprovedExport {
  const manifest = input.productionPackage.manifest;
  if (manifest.schema_id !== "strongr.production_package.v1") {
    throw new Error("production package schema is unsupported");
  }
  const content = parseStrongrDailyAudioReflectionV2(requireObject(manifest.content, "package content"));
  if (createGenerationOutputHash(content) !== content.content_hash) {
    throw new Error("approved content hash does not match payload");
  }
  const contentPayloadHash = requireString(manifest.content_payload_hash, "content payload hash");
  const evidenceBundleHash = requireString(manifest.evidence_bundle_hash, "evidence bundle hash");
  return Object.freeze({
    approval_evidence: Object.freeze({
      check_result_ids: manifest.check_result_ids ?? null,
      check_run_id: manifest.check_run_id ?? null,
      evidence_bundle_hash: evidenceBundleHash,
      review_decision_ids: manifest.review_decision_ids ?? null,
      review_policy_id: manifest.review_policy_id ?? null,
      rights_snapshot_id: manifest.rights_snapshot_id ?? null,
      scripture_evidence_id: manifest.scripture_evidence_id ?? null,
    }),
    approval_snapshot_id: input.productionPackage.approvalSnapshotId,
    approved_content_hash: content.content_hash,
    content,
    content_payload_hash: contentPayloadHash,
    exported_at: input.exportedAt,
    package_id: input.productionPackage.id,
    publication_status: "manual_upload_required",
    schema_id: "strongr.strongr_daily_export.v1",
    source_brief_identifier: content.source_brief_identifier,
  });
}

function markdown(exported: StrongrDailyApprovedExport): string {
  const c = exported.content;
  return `# ${c.final_title}\n\n` +
    `**Manual upload required. This export does not publish content.**\n\n` +
    `- Package: ${exported.package_id}\n- Approved payload hash: ${exported.content_payload_hash}\n- Content hash: ${exported.approved_content_hash}\n- Source brief: ${exported.source_brief_identifier}\n- Exported: ${exported.exported_at}\n\n` +
    `## Scripture\n\n${c.scripture_reference.reference} (${c.scripture_reference.translation})\n\n` +
    `${c.scripture_text ? `> ${c.scripture_text}\n\n` : ""}` +
    `## App description\n\n${c.app_description}\n\n## Narration\n\n${c.narration_text}\n\n## Prayer\n\n${c.prayer}\n\n## Takeaway\n\n${c.personal_takeaway_prompt}\n\n` +
    `## Production metadata\n\n- Artwork prompt: ${c.artwork_generation_prompt}\n- Social caption: ${c.social_caption}\n- Keywords: ${c.keywords.join(", ")}\n- Estimated duration: ${c.estimated_duration_seconds} seconds\n`;
}

export function createStrongrDailyApprovedExport(input: {
  readonly productionPackage: TenantProductionPackageSummary;
  readonly exportedAt: string;
}): StrongrDailyExportFiles {
  const value = approvedExport(input);
  return Object.freeze({ json: `${JSON.stringify(value, null, 2)}\n`, markdown: markdown(value) });
}
