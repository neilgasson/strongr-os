import {
  type ContentProfileSelection,
  parseContentProfileSelection,
} from "../../../packages/content-profiles/src/schema.ts";
import {
  parseStrongrDailyAudioReflectionV2,
  type StrongrDailyAudioReflectionV2,
} from "../../../packages/content-schemas/src/index.ts";
import type {
  JsonObject,
  TenantProductionPackageSummary,
  Uuid,
} from "../../../packages/contracts/src/index.ts";

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
  readonly content_profile?: ContentProfileSelection;
  readonly content_profile_source_manifest_checksum?: string;
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

function contentProfileSelectionsEqual(
  left: ContentProfileSelection | undefined,
  right: ContentProfileSelection,
): boolean {
  return (
    left?.profile_id === right.profile_id &&
    left.profile_version === right.profile_version &&
    left.canonical_checksum === right.canonical_checksum &&
    left.content_type === right.content_type
  );
}

const utf8Encoder = new TextEncoder();

function compareJsonbKeys(left: string, right: string): number {
  const leftBytes = utf8Encoder.encode(left);
  const rightBytes = utf8Encoder.encode(right);
  const lengthDifference = leftBytes.length - rightBytes.length;
  if (lengthDifference !== 0) return lengthDifference;
  for (let index = 0; index < leftBytes.length; index += 1) {
    const byteDifference = (leftBytes[index] ?? 0) - (rightBytes[index] ?? 0);
    if (byteDifference !== 0) return byteDifference;
  }
  return 0;
}

function postgresJsonbText(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("PostgreSQL JSON does not support non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => postgresJsonbText(item)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      compareJsonbKeys(left, right),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}: ${postgresJsonbText(item)}`)
      .join(", ")}}`;
  }
  throw new Error("PostgreSQL JSON supports JSON values only");
}

async function createBrowserContentHash(content: StrongrDailyAudioReflectionV2): Promise<string> {
  const { content_hash: _contentHash, ...hashableContent } = content;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    utf8Encoder.encode(postgresJsonbText(hashableContent)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function approvedExport(input: {
  readonly productionPackage: TenantProductionPackageSummary;
  readonly exportedAt: string;
}): Promise<StrongrDailyApprovedExport> {
  const manifest = input.productionPackage.manifest;
  if (manifest.schema_id !== "strongr.production_package.v1") {
    throw new Error("production package schema is unsupported");
  }
  const content = parseStrongrDailyAudioReflectionV2(
    requireObject(manifest.content, "package content"),
  );
  if ((await createBrowserContentHash(content)) !== content.content_hash) {
    throw new Error("approved content hash does not match payload");
  }
  const contentPayloadHash = requireString(manifest.content_payload_hash, "content payload hash");
  const evidenceBundleHash = requireString(manifest.evidence_bundle_hash, "evidence bundle hash");
  let contentProfile: ContentProfileSelection | null = null;
  let contentProfileSourceManifestChecksum: string | null = null;
  if (input.productionPackage.contentProfile !== null) {
    contentProfile = parseContentProfileSelection(manifest.content_profile);
    const expected = input.productionPackage.contentProfile;
    if (
      contentProfile.profile_id !== expected.profileId ||
      contentProfile.profile_version !== expected.profileVersion ||
      contentProfile.canonical_checksum !== expected.canonicalChecksum ||
      contentProfile.content_type !== expected.contentType
    ) {
      throw new Error("production package content profile does not match manifest");
    }
    if (!contentProfileSelectionsEqual(content.content_profile, contentProfile)) {
      throw new Error("approved content profile does not match package provenance");
    }
    contentProfileSourceManifestChecksum = requireString(
      manifest.content_profile_source_manifest_checksum,
      "content profile source manifest checksum",
    );
    if (contentProfileSourceManifestChecksum !== expected.sourceManifestChecksum) {
      throw new Error("production package source manifest checksum does not match provenance");
    }
  } else if (
    (manifest.content_profile !== undefined && manifest.content_profile !== null) ||
    (manifest.content_profile_source_manifest_checksum !== undefined &&
      manifest.content_profile_source_manifest_checksum !== null)
  ) {
    throw new Error("legacy production package has unexpected content profile provenance");
  } else if (content.content_profile !== undefined) {
    throw new Error("legacy approved content has unexpected content profile provenance");
  }
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
    ...(contentProfile ? { content_profile: contentProfile } : {}),
    ...(contentProfileSourceManifestChecksum
      ? { content_profile_source_manifest_checksum: contentProfileSourceManifestChecksum }
      : {}),
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
  const profileLine = exported.content_profile
    ? `- Content profile: ${exported.content_profile.profile_id} v${exported.content_profile.profile_version} (${exported.content_profile.canonical_checksum})\n- Content profile source manifest: ${exported.content_profile_source_manifest_checksum}\n`
    : "";
  return (
    `# ${c.final_title}\n\n` +
    `**Manual upload required. This export does not publish content.**\n\n` +
    `- Package: ${exported.package_id}\n${profileLine}- Approved payload hash: ${exported.content_payload_hash}\n- Content hash: ${exported.approved_content_hash}\n- Source brief: ${exported.source_brief_identifier}\n- Exported: ${exported.exported_at}\n\n` +
    `## Scripture\n\n${c.scripture_reference.reference} (${c.scripture_reference.translation})\n\n` +
    `${c.scripture_text ? `> ${c.scripture_text}\n\n` : ""}` +
    `## App description\n\n${c.app_description}\n\n## Narration\n\n${c.narration_text}\n\n## Prayer\n\n${c.prayer}\n\n## Takeaway\n\n${c.personal_takeaway_prompt}\n\n` +
    `## Production metadata\n\n- Artwork prompt: ${c.artwork_generation_prompt}\n- Social caption: ${c.social_caption}\n- Keywords: ${c.keywords.join(", ")}\n- Estimated duration: ${c.estimated_duration_seconds} seconds\n`
  );
}

export async function createStrongrDailyApprovedExport(input: {
  readonly productionPackage: TenantProductionPackageSummary;
  readonly exportedAt: string;
}): Promise<StrongrDailyExportFiles> {
  const value = await approvedExport(input);
  return Object.freeze({ json: `${JSON.stringify(value, null, 2)}\n`, markdown: markdown(value) });
}
