import Schema from "typebox/schema";
import Type from "typebox";

export const contentProfileSchemaId = "strongr.strongr_daily_content_profile.v1" as const;
export const contentProfileRegistrySchemaId =
  "strongr.strongr_daily_content_profile_registry.v1" as const;
export const contentProfileSourceManifestSchemaId =
  "strongr.strongr_daily_content_profile_source_manifest.v1" as const;

const text = (maximum: number) => Type.String({ minLength: 1, maxLength: maximum, pattern: "\\S" });
const identifier = Type.String({
  minLength: 1,
  maxLength: 160,
  pattern: "^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$",
});
const checksum = Type.String({ pattern: "^[a-f0-9]{64}$" });
const sourceCitedGuidanceSchema = Type.Object(
  {
    guidance: text(1_000),
    source_ids: Type.Array(identifier, { maxItems: 20, minItems: 1 }),
  },
  { additionalProperties: false },
);
const guidance = Type.Array(sourceCitedGuidanceSchema, { maxItems: 40 });

const boundedRangeSchema = Type.Object(
  {
    maximum: Type.Integer({ minimum: 1 }),
    minimum: Type.Integer({ minimum: 0 }),
    target: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

const sectionSchema = Type.Object(
  {
    guidance,
    name: text(120),
    order: Type.Integer({ minimum: 1 }),
    requirement: Type.Union([
      Type.Literal("required"),
      Type.Literal("optional"),
      Type.Literal("not_applicable"),
    ]),
    section_id: identifier,
  },
  { additionalProperties: false },
);

const profileRulesSchema = Type.Object(
  {
    closing_language: guidance,
    introduction_and_welcome_style: guidance,
    narration_and_elevenlabs_formatting: guidance,
    personal_takeaway_and_journal_prompts: guidance,
    prayer_style_and_expected_length: guidance,
    prohibited_language_and_framing: guidance,
    reflection_or_teaching_depth: guidance,
    scripture_placement_and_translation_handling: guidance,
    series_continuity_rules: guidance,
    study_questions_and_learning_structure: guidance,
    theological_and_editorial_boundaries: guidance,
    title_description_artwork_and_app_metadata: guidance,
  },
  { additionalProperties: false },
);

export const contentProfileSchema = Type.Object(
  {
    activation_status: Type.Union([Type.Literal("inactive"), Type.Literal("active")]),
    approved_source_example_ids: Type.Array(identifier, { maxItems: 40 }),
    canonical_checksum: checksum,
    content_type: identifier,
    display_name: text(160),
    expected_duration_and_length: Type.Optional(
      Type.Object(
        {
          duration_seconds: Type.Optional(boundedRangeSchema),
          word_count: Type.Optional(boundedRangeSchema),
        },
        { additionalProperties: false },
      ),
    ),
    format_variant: Type.Optional(identifier),
    lifecycle: Type.Union([
      Type.Literal("inventory_only"),
      Type.Literal("source_required"),
      Type.Literal("draft_unapproved"),
      Type.Literal("owner_review"),
      Type.Literal("owner_approved_inactive"),
      Type.Literal("active"),
      Type.Literal("superseded"),
      Type.Literal("retired"),
    ]),
    profile_id: identifier,
    profile_version: Type.Integer({ minimum: 1 }),
    purpose_and_audience: Type.Optional(
      Type.Object(
        {
          audiences: Type.Array(text(300), { maxItems: 20, minItems: 1 }),
          purpose: text(2_000),
          source_ids: Type.Array(identifier, { maxItems: 20, minItems: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
    rules: profileRulesSchema,
    schema_id: Type.Literal(contentProfileSchemaId),
    sections: Type.Array(sectionSchema, { maxItems: 40 }),
    source_ids: Type.Array(identifier, { maxItems: 80 }),
    source_manifest_version: Type.Integer({ minimum: 1 }),
    unresolved_decisions: Type.Array(text(1_000), { maxItems: 80 }),
  },
  {
    $id: "https://strongr.os/schemas/strongr.strongr_daily_content_profile.v1.json",
    additionalProperties: false,
  },
);

const sourceReferenceSchema = Type.Object(
  {
    approved_as_normative: Type.Boolean(),
    locator: text(1_000),
    source_id: identifier,
    source_kind: Type.Union([
      Type.Literal("approved_example"),
      Type.Literal("content_contract"),
      Type.Literal("documentation"),
      Type.Literal("handoff"),
      Type.Literal("project_record"),
      Type.Literal("script"),
      Type.Literal("series_plan"),
      Type.Literal("style_guidance"),
    ]),
    source_revision: text(160),
    source_sha256: Type.Optional(checksum),
    provider_use_status: Type.Union([
      Type.Literal("forbidden"),
      Type.Literal("metadata_only"),
      Type.Literal("approved"),
    ]),
    rights_status: Type.Union([
      Type.Literal("repository_source"),
      Type.Literal("review_required"),
      Type.Literal("approved"),
    ]),
    status: Type.Union([
      Type.Literal("inventory_only"),
      Type.Literal("reviewed"),
      Type.Literal("approved"),
    ]),
    title: text(300),
  },
  { additionalProperties: false },
);

export const contentProfileSourceManifestSchema = Type.Object(
  {
    canonical_checksum: checksum,
    manifest_version: Type.Integer({ minimum: 1 }),
    schema_id: Type.Literal(contentProfileSourceManifestSchemaId),
    sources: Type.Array(sourceReferenceSchema, { maxItems: 500, minItems: 1 }),
  },
  {
    $id: "https://strongr.os/schemas/strongr.strongr_daily_content_profile_source_manifest.v1.json",
    additionalProperties: false,
  },
);

export const contentProfileRegistrySchema = Type.Object(
  {
    activation_policy: Type.Literal("disabled_pending_owner_review"),
    canonical_checksum: checksum,
    library_id: Type.Literal("strongr_daily"),
    profiles: Type.Array(contentProfileSchema, { maxItems: 100, minItems: 1 }),
    registry_version: Type.Integer({ minimum: 1 }),
    schema_id: Type.Literal(contentProfileRegistrySchemaId),
    source_manifest_checksum: checksum,
  },
  {
    $id: "https://strongr.os/schemas/strongr.strongr_daily_content_profile_registry.v1.json",
    additionalProperties: false,
  },
);

export const contentProfileSelectionSchema = Type.Object(
  {
    canonical_checksum: checksum,
    content_type: identifier,
    profile_id: identifier,
    profile_version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export type ContentProfile = Type.Static<typeof contentProfileSchema>;
export type ContentProfileRegistry = Type.Static<typeof contentProfileRegistrySchema>;
export type ContentProfileSelection = Type.Static<typeof contentProfileSelectionSchema>;
export type ContentProfileSourceManifest = Type.Static<typeof contentProfileSourceManifestSchema>;
export type UnsignedContentProfile = Omit<ContentProfile, "canonical_checksum">;
export type UnsignedContentProfileRegistry = Omit<ContentProfileRegistry, "canonical_checksum">;
export type UnsignedContentProfileSourceManifest = Omit<
  ContentProfileSourceManifest,
  "canonical_checksum"
>;

const profileValidator = Schema.Compile(contentProfileSchema);
const registryValidator = Schema.Compile(contentProfileRegistrySchema);
const selectionValidator = Schema.Compile(contentProfileSelectionSchema);
const sourceManifestValidator = Schema.Compile(contentProfileSourceManifestSchema);

export function parseContentProfile(value: unknown): ContentProfile {
  return profileValidator.Parse(value);
}

export function parseContentProfileRegistry(value: unknown): ContentProfileRegistry {
  return registryValidator.Parse(value);
}

export function parseContentProfileSelection(value: unknown): ContentProfileSelection {
  return selectionValidator.Parse(value);
}

export function parseContentProfileSourceManifest(value: unknown): ContentProfileSourceManifest {
  return sourceManifestValidator.Parse(value);
}
