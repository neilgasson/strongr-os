import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  ContentProfileLibraryError,
  canonicalSha256,
  computeContentProfileChecksum,
  computeContentProfileRegistryChecksum,
  computeContentProfileSourceManifestChecksum,
  contentProfileRegistrySchemaId,
  contentProfileSchemaId,
  contentProfileSourceManifestSchemaId,
  createContentProfileLibrary,
  inspectContentProfile,
  parseContentProfileSourceManifest,
  resolveContentProfile,
  strongrDailyContentProfileLibraryV1,
  strongrDailyContentProfileRegistryV1,
  strongrDailyContentProfileSourceManifestV1,
  type UnsignedContentProfile,
  type UnsignedContentProfileRegistry,
  type UnsignedContentProfileSourceManifest,
} from "../src/index.ts";

const sourceWithoutChecksum: UnsignedContentProfileSourceManifest = {
  manifest_version: 1,
  schema_id: contentProfileSourceManifestSchemaId,
  sources: [
    {
      approved_as_normative: true,
      locator: "docs/business/approved-short-reflection.md",
      provider_use_status: "forbidden",
      rights_status: "approved",
      source_id: "approved.short_reflection.example",
      source_kind: "approved_example",
      source_revision: "git:fixture",
      source_sha256: "a".repeat(64),
      status: "approved",
      title: "Approved short reflection example",
    },
  ],
};

const sourceManifest = {
  ...sourceWithoutChecksum,
  canonical_checksum: computeContentProfileSourceManifestChecksum(sourceWithoutChecksum),
};

const profileWithoutChecksum: UnsignedContentProfile = {
  activation_status: "inactive",
  approved_source_example_ids: ["approved.short_reflection.example"],
  content_type: "short_reflection",
  display_name: "Short reflection",
  expected_duration_and_length: {
    duration_seconds: { maximum: 360, minimum: 180, target: 300 },
    word_count: { maximum: 700, minimum: 350, target: 525 },
  },
  lifecycle: "owner_review",
  profile_id: "strongr_daily.short_reflection",
  profile_version: 1,
  purpose_and_audience: {
    audiences: ["Fixture audience"],
    purpose: "Exercise the governed profile-library contract without activating generation.",
    source_ids: ["approved.short_reflection.example"],
  },
  rules: {
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
  },
  schema_id: contentProfileSchemaId,
  sections: [
    {
      guidance: [],
      name: "Opening",
      order: 1,
      requirement: "required",
      section_id: "opening",
    },
  ],
  source_ids: ["approved.short_reflection.example"],
  source_manifest_version: 1,
  unresolved_decisions: ["Owner review remains required before activation."],
};

const profile = {
  ...profileWithoutChecksum,
  canonical_checksum: computeContentProfileChecksum(profileWithoutChecksum),
};

function createRegistry(
  profileOverride: typeof profile = profile,
  sourceChecksum = sourceManifest.canonical_checksum,
) {
  const unsigned: UnsignedContentProfileRegistry = {
    activation_policy: "disabled_pending_owner_review",
    library_id: "strongr_daily",
    profiles: [profileOverride],
    registry_version: 1,
    schema_id: contentProfileRegistrySchemaId,
    source_manifest_checksum: sourceChecksum,
  };
  return {
    ...unsigned,
    canonical_checksum: computeContentProfileRegistryChecksum(unsigned),
  };
}

function expectCode(code: ContentProfileLibraryError["code"]): (error: unknown) => boolean {
  return (error: unknown) => error instanceof ContentProfileLibraryError && error.code === code;
}

test("canonical checksum is stable across object-key order and changes with content", () => {
  assert.equal(canonicalSha256({ b: 2, a: 1 }), canonicalSha256({ a: 1, b: 2 }));
  assert.notEqual(canonicalSha256({ a: 1 }), canonicalSha256({ a: 2 }));
});

test("checked-in source manifest exactly matches runtime provenance and normative files", () => {
  const manifestPath = resolve(
    process.cwd(),
    "docs/business/STRONGR_DAILY_CONTENT_PROFILE_SOURCE_MANIFEST.v1.json",
  );
  const checkedIn = parseContentProfileSourceManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
  );
  assert.deepEqual(checkedIn, strongrDailyContentProfileSourceManifestV1);
  assert.equal(
    computeContentProfileSourceManifestChecksum(checkedIn),
    checkedIn.canonical_checksum,
  );

  for (const source of checkedIn.sources) {
    if (!source.approved_as_normative) {
      assert.equal(source.source_sha256, undefined);
      continue;
    }
    assert.ok(source.source_sha256);
    const actual = createHash("sha256")
      .update(readFileSync(resolve(process.cwd(), source.locator)))
      .digest("hex");
    assert.equal(actual, source.source_sha256, source.locator);
    assert.equal(source.source_revision, `sha256:${actual}`);
  }
});

test("library validates exact checksums and exposes immutable review-only profiles", () => {
  const library = createContentProfileLibrary({
    registry: createRegistry(),
    sourceManifest,
  });

  assert.equal(
    inspectContentProfile(library, {
      profile_id: profile.profile_id,
      profile_version: profile.profile_version,
    }),
    profile,
  );
  assert.equal(Object.isFrozen(library), true);
  assert.equal(Object.isFrozen(library.registry.profiles[0]), true);
  assert.throws(
    () =>
      resolveContentProfile(library, {
        canonical_checksum: profile.canonical_checksum,
        content_type: profile.content_type,
        profile_id: profile.profile_id,
        profile_version: profile.profile_version,
      }),
    expectCode("content_profile_resolution_disabled"),
  );
});

test("library rejects activated, altered, duplicate, and unbound profiles", () => {
  const active = {
    ...profile,
    activation_status: "active" as const,
    lifecycle: "active" as const,
  };
  active.canonical_checksum = computeContentProfileChecksum(active);
  assert.throws(
    () => createContentProfileLibrary({ registry: createRegistry(active), sourceManifest }),
    expectCode("content_profile_activation_forbidden"),
  );

  assert.throws(
    () =>
      createContentProfileLibrary({
        registry: { ...createRegistry(), canonical_checksum: "0".repeat(64) },
        sourceManifest,
      }),
    expectCode("content_profile_registry_checksum_invalid"),
  );

  const { purpose_and_audience: _purposeAndAudience, ...profileWithoutPurpose } =
    profileWithoutChecksum;
  const missingSource = {
    ...profileWithoutPurpose,
    approved_source_example_ids: [],
    source_ids: ["missing.source"],
  };
  const signedMissingSource = {
    ...missingSource,
    canonical_checksum: computeContentProfileChecksum(missingSource),
  };
  assert.throws(
    () =>
      createContentProfileLibrary({
        registry: createRegistry(signedMissingSource),
        sourceManifest,
      }),
    expectCode("content_profile_source_missing"),
  );

  const unsignedDuplicate: UnsignedContentProfileRegistry = {
    ...createRegistry(),
    profiles: [profile, profile],
  };
  const duplicateRegistry = {
    ...unsignedDuplicate,
    canonical_checksum: computeContentProfileRegistryChecksum(unsignedDuplicate),
  };
  assert.throws(
    () => createContentProfileLibrary({ registry: duplicateRegistry, sourceManifest }),
    expectCode("content_profile_duplicate"),
  );
});

test("resolution requires exact type, version, and checksum and fails closed", () => {
  const library = createContentProfileLibrary({
    registry: createRegistry(),
    sourceManifest,
  });

  assert.throws(
    () =>
      resolveContentProfile(library, {
        canonical_checksum: profile.canonical_checksum,
        content_type: "bible_study",
        profile_id: profile.profile_id,
        profile_version: profile.profile_version,
      }),
    expectCode("content_profile_content_type_mismatch"),
  );
  assert.throws(
    () =>
      resolveContentProfile(library, {
        canonical_checksum: "f".repeat(64),
        content_type: profile.content_type,
        profile_id: profile.profile_id,
        profile_version: profile.profile_version,
      }),
    expectCode("content_profile_selection_checksum_mismatch"),
  );
  assert.throws(
    () =>
      resolveContentProfile(library, {
        canonical_checksum: profile.canonical_checksum,
        content_type: profile.content_type,
        profile_id: profile.profile_id,
        profile_version: 2,
      }),
    expectCode("content_profile_version_not_found"),
  );
  assert.throws(
    () => resolveContentProfile(library, { profile_id: profile.profile_id }),
    expectCode("content_profile_selection_invalid"),
  );
});

test("checked-in Strongr Daily inventory is complete, checksum-bound, and wholly inactive", () => {
  assert.equal(strongrDailyContentProfileRegistryV1.profiles.length, 12);
  assert.equal(strongrDailyContentProfileSourceManifestV1.sources.length, 9);
  assert.equal(
    strongrDailyContentProfileSourceManifestV1.canonical_checksum,
    "8ba29991786e6d5172ccebe8ebccbd58365c58939d98ee387fdbc0fa31f50b06",
  );
  assert.equal(
    strongrDailyContentProfileRegistryV1.canonical_checksum,
    "56afcc943ad35e38823b6a9294e1911244dd660cd2030585cffd1eb7f771f679",
  );
  assert.equal(
    strongrDailyContentProfileRegistryV1.source_manifest_checksum,
    strongrDailyContentProfileSourceManifestV1.canonical_checksum,
  );
  assert.equal(
    strongrDailyContentProfileRegistryV1.profiles.every(
      (candidate) =>
        candidate.activation_status === "inactive" &&
        candidate.lifecycle !== "active" &&
        candidate.approved_source_example_ids.length === 0,
    ),
    true,
  );
  assert.equal(
    strongrDailyContentProfileSourceManifestV1.sources.every(
      (source) => source.provider_use_status === "forbidden",
    ),
    true,
  );
  assert.equal(strongrDailyContentProfileLibraryV1.registry, strongrDailyContentProfileRegistryV1);
  const candidate = strongrDailyContentProfileRegistryV1.profiles.find(
    (entry) => entry.profile_id === "strongr_daily_audio_reflection_v2",
  );
  assert.ok(candidate);
  assert.throws(
    () =>
      resolveContentProfile(strongrDailyContentProfileLibraryV1, {
        canonical_checksum: candidate.canonical_checksum,
        content_type: candidate.content_type,
        profile_id: candidate.profile_id,
        profile_version: candidate.profile_version,
      }),
    expectCode("content_profile_resolution_disabled"),
  );
});
