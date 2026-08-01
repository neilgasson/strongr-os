import {
  type ContentProfile,
  contentProfileRegistrySchemaId,
  contentProfileSchemaId,
  contentProfileSourceManifestSchemaId,
  type UnsignedContentProfile,
  type UnsignedContentProfileRegistry,
  type UnsignedContentProfileSourceManifest,
} from "./schema.ts";

const sourceManifestWithoutChecksum: UnsignedContentProfileSourceManifest = {
  manifest_version: 1,
  schema_id: contentProfileSourceManifestSchemaId,
  sources: [
    source(
      "locked-economic-target-plan",
      "documentation",
      "docs/business/STRONGR_DAILY_ECONOMIC_TARGET_PLAN_LOCKED.md",
      "Locked Strongr Daily economic-target plan",
      "76dafb929acf62293e1029bac40880ba173cae8cddc3fa798c0e7e1f4865dba8",
    ),
    source(
      "audio-reflection-contracts",
      "content_contract",
      "packages/content-schemas/src/audio-reflection.ts",
      "Audio-reflection content contracts",
      "736b15a84afd1f548680cb94a33a2faa4b9d622f445f82430c8939fec0502cbe",
    ),
    source(
      "governed-audio-reflection-database-scope",
      "content_contract",
      "supabase/migrations/202607241330_m1_governed_audio_reflection.sql",
      "Governed audio-reflection database scope",
      "287b1ecd49357be2d4874b01047a5a925c1dc570a31ca9ace9433a66b312d8b3",
    ),
    source(
      "v2-audio-reflection-schema-allowlist",
      "content_contract",
      "supabase/migrations/20260728090000_strongr_daily_audio_reflection_v2.sql",
      "Strongr Daily v2 audio-reflection schema allowlist",
      "7ca64b99edfffd27d94776dfab154b963eab14eefe38ba8615086680ed64aadf",
    ),
    source(
      "engineering-content-governance",
      "style_guidance",
      "docs/standards/Strongr_OS_Engineering_Standards_v1.0.md",
      "Strongr OS engineering content-governance standards",
      "98301f9b9b16b9e6371f05e994302a6caf695c9a5782d8466de67c342a011e78",
    ),
    source(
      "quiet-trust-phase-4a-checkpoint",
      "project_record",
      "evidence/phase-4a/acceptance-record.json",
      "Quiet Trust Phase 4A checkpoint",
      "dd6558e2e2d3c3fe2cce9895ff448b0743065d3471aa66c1cfdf5acda626ce8a",
    ),
    source(
      "approved-package-export-projection",
      "content_contract",
      "apps/studio/src/strongr-daily-export.ts",
      "Approved package export projection",
      "de35a0692738929f1ec243ff2cb90dbc141267197f38a664d7e41defd74c5163",
    ),
    source(
      "scripture-rights-pre-call-boundary",
      "documentation",
      "docs/runbooks/phase-4b-live-provider.md",
      "Scripture-rights pre-call boundary",
      "d798082b086075e02d6d9ac7d7cc4a7b48eb7bce0dda2a9a5aa803f7e2d39a8c",
    ),
    source(
      "current-generic-provider-candidate",
      "script",
      "packages/ai/src/openai-strongr-daily-v2-adapter.ts",
      "Current generic provider candidate",
      "9a95be1592705b7dcb9ab6aaf185d8540b88ac8a6c563ed7d6c8ec79bb270787",
      false,
    ),
  ],
};

function source(
  source_id: string,
  source_kind:
    | "content_contract"
    | "documentation"
    | "project_record"
    | "script"
    | "style_guidance",
  locator: string,
  title: string,
  source_sha256: string,
  approved_as_normative = true,
) {
  return {
    approved_as_normative,
    locator,
    provider_use_status: "forbidden" as const,
    rights_status: "repository_source" as const,
    source_id,
    source_kind,
    source_revision: approved_as_normative
      ? `sha256:${source_sha256}`
      : "working-tree-candidate:2026-07-31",
    ...(approved_as_normative ? { source_sha256 } : {}),
    status: "reviewed" as const,
    title,
  };
}

export const strongrDailyContentProfileSourceManifestV1 = {
  ...sourceManifestWithoutChecksum,
  canonical_checksum: "8ba29991786e6d5172ccebe8ebccbd58365c58939d98ee387fdbc0fa31f50b06",
};

const profileChecksums: Readonly<Record<string, string>> = Object.freeze({
  bible_study: "6bd250cbc5f591b036da07a4842573ff3d2183b2a7719ba42e4bbf9983a04cff",
  devotional_experience: "5867d658e350fd150987bad37a9669e84061ce5883c0b63c051fbc9e407d5437",
  guided_audio_reflection: "5b838ddbeab4f7d638f7f00dbcd8356bbc1dc9f8c63aa3267de25a76e8991c64",
  guided_prayer: "6aca9861b20b664a1caa0606684e5aac593fb407b6da1197eb69dfebfd36d13e",
  journal_and_personal_takeaway: "a7777264e8afc43bd7f28b16c73615f02e3def2463d7091787e9cd5aba880863",
  legacy_audio_reflection_v1: "7d049b320b68058c82b92b790ca3a8ef6b24037c020fd53dd370c1a5d2af99a9",
  long_form_reflection: "7de8a9b0cf0f83ecbcfb8deb1323fc008a0d880a40e605a9e4ffd8ae2a2c50a2",
  prayer_and_personal_takeaway_prompts:
    "7f60069385732f22e48f7a534a507f88eccc032856d998c467ba92e54f22552c",
  scripture_reading_series: "8c5251676c70e8b8a76cd2bbf7d04b68d658cb6540fa39243005125c8931fd7f",
  series_description: "823601c83de655d6795b471de8f32180d26607b92c9a578356178c9c83c05164",
  short_form_reflection: "c27d6342d47d2faefc5fd62f8e1e37186fa5a5d8d5e395cbbfd654618ac75c3e",
  strongr_daily_audio_reflection_v2:
    "e8249cc746ad68415b972dc55e7962928e3846397ce5250f1f999d022fc498de",
});

const emptyRules = (): UnsignedContentProfile["rules"] => ({
  closing_language: [],
  introduction_and_welcome_style: [],
  narration_and_elevenlabs_formatting: [],
  personal_takeaway_and_journal_prompts: [],
  prayer_style_and_expected_length: [],
  prohibited_language_and_framing: [],
  reflection_or_teaching_depth: [],
  scripture_placement_and_translation_handling: [],
  series_continuity_rules: [],
  study_questions_and_learning_structure: [],
  theological_and_editorial_boundaries: [],
  title_description_artwork_and_app_metadata: [],
});

function profile(input: {
  readonly content_type: string;
  readonly display_name: string;
  readonly format_variant?: string;
  readonly lifecycle: UnsignedContentProfile["lifecycle"];
  readonly profile_id: string;
  readonly profile_version: number;
  readonly source_ids: string[];
  readonly unresolved_decisions: string[];
}): ContentProfile {
  const unsigned: UnsignedContentProfile = {
    activation_status: "inactive",
    approved_source_example_ids: [],
    content_type: input.content_type,
    display_name: input.display_name,
    ...(input.format_variant ? { format_variant: input.format_variant } : {}),
    lifecycle: input.lifecycle,
    profile_id: input.profile_id,
    profile_version: input.profile_version,
    rules: emptyRules(),
    schema_id: contentProfileSchemaId,
    sections: [],
    source_ids: input.source_ids,
    source_manifest_version: 1,
    unresolved_decisions: input.unresolved_decisions,
  };
  const canonical_checksum = profileChecksums[input.profile_id];
  if (!canonical_checksum) throw new Error("content_profile_checksum_not_pinned");
  return {
    ...unsigned,
    canonical_checksum,
  };
}

const profiles: ContentProfile[] = [
  profile({
    content_type: "audio_reflection",
    display_name: "audio reflection",
    format_variant: "legacy_v1",
    lifecycle: "inventory_only",
    profile_id: "legacy_audio_reflection_v1",
    profile_version: 1,
    source_ids: ["audio-reflection-contracts", "governed-audio-reflection-database-scope"],
    unresolved_decisions: [
      "Legacy field contracts are not an approved Strongr Daily creative profile.",
    ],
  }),
  profile({
    content_type: "audio_reflection",
    display_name: "Strongr Daily audio reflection",
    format_variant: "v2",
    lifecycle: "source_required",
    profile_id: "strongr_daily_audio_reflection_v2",
    profile_version: 2,
    source_ids: [
      "audio-reflection-contracts",
      "v2-audio-reflection-schema-allowlist",
      "quiet-trust-phase-4a-checkpoint",
      "approved-package-export-projection",
      "scripture-rights-pre-call-boundary",
      "current-generic-provider-candidate",
    ],
    unresolved_decisions: [
      "Creative format rules and an approved prose example are not preserved in the repository.",
      "The current generic provider candidate is not an approved creative source.",
    ],
  }),
  profile({
    content_type: "guided_audio_reflection",
    display_name: "guided audio reflections",
    lifecycle: "source_required",
    profile_id: "guided_audio_reflection",
    profile_version: 1,
    source_ids: ["locked-economic-target-plan"],
    unresolved_decisions: ["Only the format name is preserved; creative rules are unresolved."],
  }),
  profile({
    content_type: "devotional_experience",
    display_name: "devotional experiences",
    lifecycle: "source_required",
    profile_id: "devotional_experience",
    profile_version: 1,
    source_ids: ["locked-economic-target-plan"],
    unresolved_decisions: ["Only the format name is preserved; creative rules are unresolved."],
  }),
  profile({
    content_type: "scripture_reading_series",
    display_name: "Scripture-reading series",
    lifecycle: "source_required",
    profile_id: "scripture_reading_series",
    profile_version: 1,
    source_ids: ["locked-economic-target-plan", "scripture-rights-pre-call-boundary"],
    unresolved_decisions: [
      "Reading structure, series progression, narration rules, and Scripture rights remain unresolved.",
    ],
  }),
  profile({
    content_type: "prayer_and_personal_takeaway_prompts",
    display_name: "prayers and personal-takeaway prompts",
    lifecycle: "source_required",
    profile_id: "prayer_and_personal_takeaway_prompts",
    profile_version: 1,
    source_ids: ["locked-economic-target-plan", "engineering-content-governance"],
    unresolved_decisions: [
      "Standalone versus embedded use and the public-editorial versus private-user-data boundary remain unresolved.",
    ],
  }),
  profile({
    content_type: "short_form_reflection",
    display_name: "short-form reflection",
    lifecycle: "source_required",
    profile_id: "short_form_reflection",
    profile_version: 1,
    source_ids: [],
    unresolved_decisions: ["Prior approved source material has not been ingested."],
  }),
  profile({
    content_type: "long_form_reflection",
    display_name: "long-form reflection",
    lifecycle: "source_required",
    profile_id: "long_form_reflection",
    profile_version: 1,
    source_ids: [],
    unresolved_decisions: ["Prior approved source material has not been ingested."],
  }),
  profile({
    content_type: "bible_study",
    display_name: "Bible study",
    lifecycle: "source_required",
    profile_id: "bible_study",
    profile_version: 1,
    source_ids: [],
    unresolved_decisions: [
      "Prior approved source material and supported study variants have not been ingested.",
    ],
  }),
  profile({
    content_type: "guided_prayer",
    display_name: "guided prayer",
    lifecycle: "source_required",
    profile_id: "guided_prayer",
    profile_version: 1,
    source_ids: ["engineering-content-governance"],
    unresolved_decisions: [
      "Prior approved source material and the private prayer-data boundary remain unresolved.",
    ],
  }),
  profile({
    content_type: "journal_and_personal_takeaway",
    display_name: "journal and personal-takeaway prompts",
    lifecycle: "source_required",
    profile_id: "journal_and_personal_takeaway",
    profile_version: 1,
    source_ids: ["engineering-content-governance"],
    unresolved_decisions: [
      "Prior approved source material and the private journal-data boundary remain unresolved.",
    ],
  }),
  profile({
    content_type: "series_description",
    display_name: "series descriptions",
    lifecycle: "source_required",
    profile_id: "series_description",
    profile_version: 1,
    source_ids: [],
    unresolved_decisions: [
      "Prior approved source material and continuity metadata have not been ingested.",
    ],
  }),
];

const registryWithoutChecksum: UnsignedContentProfileRegistry = {
  activation_policy: "disabled_pending_owner_review",
  library_id: "strongr_daily",
  profiles,
  registry_version: 1,
  schema_id: contentProfileRegistrySchemaId,
  source_manifest_checksum: strongrDailyContentProfileSourceManifestV1.canonical_checksum,
};

export const strongrDailyContentProfileRegistryV1 = {
  ...registryWithoutChecksum,
  canonical_checksum: "56afcc943ad35e38823b6a9294e1911244dd660cd2030585cffd1eb7f771f679",
};
