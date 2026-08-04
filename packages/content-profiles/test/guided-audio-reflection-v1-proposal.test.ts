import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  assessGuidedAudioReflectionV1ActivationCandidate,
  type ContentProfile,
  ContentProfileLibraryError,
  computeContentProfileChecksum,
  computeContentProfileRegistryChecksum,
  computeContentProfileSourceManifestChecksum,
  createContentProfileLibrary,
  guidedAudioReflectionV1Proposal,
  guidedAudioReflectionV1ProposalLibrary,
  guidedAudioReflectionV1ProposalOwnerGate,
  guidedAudioReflectionV1ProposalRegistryV2,
  guidedAudioReflectionV1ProposalSourceManifestV2,
  parseContentProfileSourceManifest,
  resolveContentProfile,
  strongrDailyContentProfileRegistryV1,
  type UnsignedContentProfileRegistry,
} from "../src/index.ts";

const expectCode =
  (code: ContentProfileLibraryError["code"]) =>
  (error: unknown): boolean =>
    error instanceof ContentProfileLibraryError && error.code === code;

test("guided proposal is bound to the exact checked-in source manifest v2", () => {
  const checkedIn = parseContentProfileSourceManifest(
    JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "docs/business/STRONGR_DAILY_CONTENT_PROFILE_SOURCE_MANIFEST.v2.json",
        ),
        "utf8",
      ),
    ),
  );

  assert.deepEqual(checkedIn, guidedAudioReflectionV1ProposalSourceManifestV2);
  assert.equal(checkedIn.sources.length, 13);
  assert.equal(
    computeContentProfileSourceManifestChecksum(checkedIn),
    "565962f24197e7e603d00aa8f8f4bf6c2fed1325dbd7f435e28aa45159aad7cc",
  );

  for (const source of checkedIn.sources) {
    if (!source.approved_as_normative) continue;
    assert.ok(source.source_sha256, source.source_id);
    const actual = createHash("sha256")
      .update(readFileSync(resolve(process.cwd(), source.locator)))
      .digest("hex");
    assert.equal(actual, source.source_sha256, source.locator);
    assert.equal(source.source_revision, `sha256:${actual}`);
  }
});

test("guided proposal defines one inactive 300-second five-part governed format", () => {
  assert.equal(guidedAudioReflectionV1Proposal.profile_id, "guided_audio_reflection");
  assert.equal(guidedAudioReflectionV1Proposal.profile_version, 1);
  assert.equal(guidedAudioReflectionV1Proposal.content_type, "audio_reflection");
  assert.equal(guidedAudioReflectionV1Proposal.format_variant, "guided_v1");
  assert.equal(guidedAudioReflectionV1Proposal.lifecycle, "owner_review");
  assert.equal(guidedAudioReflectionV1Proposal.activation_status, "inactive");
  assert.equal(
    guidedAudioReflectionV1Proposal.expected_duration_and_length?.duration_seconds?.target,
    300,
  );
  assert.deepEqual(
    guidedAudioReflectionV1Proposal.sections.map((section) => ({
      id: section.section_id,
      order: section.order,
      requirement: section.requirement,
    })),
    [
      { id: "warm_welcome", order: 1, requirement: "required" },
      { id: "scripture_introduction", order: 2, requirement: "required" },
      { id: "reflection", order: 3, requirement: "required" },
      { id: "prayer", order: 4, requirement: "required" },
      { id: "closing_invitation", order: 5, requirement: "required" },
    ],
  );
  assert.equal(guidedAudioReflectionV1ProposalRegistryV2.profiles.length, 1);

  const supportingOutputRule =
    guidedAudioReflectionV1Proposal.rules.title_description_artwork_and_app_metadata[0]?.guidance;
  assert.ok(supportingOutputRule);
  for (const output of [
    "final title",
    "Scripture metadata",
    "app description",
    "short summary",
    "personal takeaway prompt",
    "artwork prompt",
    "social caption",
    "keywords",
    "narration-ready text",
    "duration estimate",
  ]) {
    assert.match(supportingOutputRule, new RegExp(output, "i"), output);
  }
  assert.match(supportingOutputRule, /same governed draft/i);
  assert.match(supportingOutputRule, /none is a separate profile or approval path/i);
});

test("proposal and registry checksums are exact and owner approval remains unresolved", () => {
  assert.equal(
    guidedAudioReflectionV1Proposal.canonical_checksum,
    "920189adc84698ea9502d2eb6ac48b4e95b79d022a34d3a26ae318324791238a",
  );
  assert.equal(
    computeContentProfileChecksum(guidedAudioReflectionV1Proposal),
    guidedAudioReflectionV1Proposal.canonical_checksum,
  );
  assert.equal(
    guidedAudioReflectionV1ProposalRegistryV2.canonical_checksum,
    "517e4abcff9af4cbc44cd6d2400b9ac9f1b99a7abb3cc1b51831a34226b2028a",
  );
  assert.equal(
    computeContentProfileRegistryChecksum(guidedAudioReflectionV1ProposalRegistryV2),
    guidedAudioReflectionV1ProposalRegistryV2.canonical_checksum,
  );
  assert.deepEqual(guidedAudioReflectionV1Proposal.unresolved_decisions, [
    "Exact owner approval of this checksum-bound proposal for a future separately reviewed development-only activation remains required.",
  ]);
  assert.equal(
    guidedAudioReflectionV1ProposalRegistryV2.activation_policy,
    "disabled_pending_owner_review",
  );
  const narrationRule =
    guidedAudioReflectionV1Proposal.rules.narration_and_elevenlabs_formatting[0]?.guidance;
  assert.match(narrationRule ?? "", /one complete, locked/i);
  assert.match(narrationRule ?? "", /only spoken provider input/i);
  assert.match(narrationRule ?? "", /full prayer/i);
  const narrativeRule =
    guidedAudioReflectionV1Proposal.rules.reflection_or_teaching_depth[0]?.guidance;
  assert.match(narrativeRule ?? "", /biblical account.*primary vehicle/i);
  assert.match(narrativeRule ?? "", /restrained imaginative reflection/i);
  assert.deepEqual(guidedAudioReflectionV1ProposalOwnerGate, {
    activation_authorized: false,
    eligible_for_owner_approval: true,
    future_activation_scope: "development_only",
    owner_approval_status: "pending",
    profile_checksum: guidedAudioReflectionV1Proposal.canonical_checksum,
    profile_id: "guided_audio_reflection",
    profile_resolution_authorized: false,
    profile_version: 1,
    provider_call_authorized: false,
    provider_spend_authorized: false,
    source_manifest_checksum: guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
  });
  assert.equal(Object.isFrozen(guidedAudioReflectionV1ProposalOwnerGate), true);
});

test("proposal library never resolves or authorizes activation", () => {
  assert.equal(Object.isFrozen(guidedAudioReflectionV1ProposalLibrary), true);
  assert.throws(
    () =>
      resolveContentProfile(guidedAudioReflectionV1ProposalLibrary, {
        canonical_checksum: guidedAudioReflectionV1Proposal.canonical_checksum,
        content_type: guidedAudioReflectionV1Proposal.content_type,
        profile_id: guidedAudioReflectionV1Proposal.profile_id,
        profile_version: guidedAudioReflectionV1Proposal.profile_version,
      }),
    expectCode("content_profile_resolution_disabled"),
  );

  const activeWithoutChecksum = {
    ...guidedAudioReflectionV1Proposal,
    activation_status: "active" as const,
    lifecycle: "active" as const,
  };
  const active: ContentProfile = {
    ...activeWithoutChecksum,
    canonical_checksum: computeContentProfileChecksum(activeWithoutChecksum),
  };
  const activeRegistryWithoutChecksum: UnsignedContentProfileRegistry = {
    ...guidedAudioReflectionV1ProposalRegistryV2,
    profiles: [active],
  };
  const activeRegistry = {
    ...activeRegistryWithoutChecksum,
    canonical_checksum: computeContentProfileRegistryChecksum(activeRegistryWithoutChecksum),
  };

  assert.throws(
    () =>
      createContentProfileLibrary({
        registry: activeRegistry,
        sourceManifest: guidedAudioReflectionV1ProposalSourceManifestV2,
      }),
    expectCode("content_profile_activation_forbidden"),
  );
});

test("only the exact checksum-bound candidate is eligible for later owner approval", () => {
  const exactSelection = {
    canonical_checksum: guidedAudioReflectionV1Proposal.canonical_checksum,
    content_type: guidedAudioReflectionV1Proposal.content_type,
    profile_id: guidedAudioReflectionV1Proposal.profile_id,
    profile_version: guidedAudioReflectionV1Proposal.profile_version,
  };
  const manifestChecksum = guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum;

  assert.deepEqual(
    assessGuidedAudioReflectionV1ActivationCandidate(exactSelection, manifestChecksum),
    {
      activation_authorized: false,
      eligible_for_owner_approval: true,
      exact_candidate: true,
      profile_resolution_authorized: false,
      provider_call_authorized: false,
    },
  );

  for (const candidate of [
    { ...exactSelection, profile_id: "devotional_experience" },
    { ...exactSelection, profile_version: 2 },
    { ...exactSelection, canonical_checksum: "0".repeat(64) },
    { ...exactSelection, content_type: "devotional_experience" },
    { ...exactSelection, unexpected_nested_profile: exactSelection },
    null,
  ]) {
    const result = assessGuidedAudioReflectionV1ActivationCandidate(candidate, manifestChecksum);
    assert.equal(result.exact_candidate, false);
    assert.equal(result.eligible_for_owner_approval, false);
    assert.equal(result.activation_authorized, false);
    assert.equal(result.profile_resolution_authorized, false);
    assert.equal(result.provider_call_authorized, false);
  }

  const wrongManifest = assessGuidedAudioReflectionV1ActivationCandidate(
    exactSelection,
    "0".repeat(64),
  );
  assert.equal(wrongManifest.exact_candidate, false);
  assert.equal(wrongManifest.eligible_for_owner_approval, false);
  assert.equal(wrongManifest.activation_authorized, false);
});

test("golden example is metadata-only and the merged v1 inventory is unchanged", () => {
  const golden = guidedAudioReflectionV1ProposalSourceManifestV2.sources.find(
    (source) => source.source_id === "quiet-trust-guided-audio-v1",
  );
  const rights = guidedAudioReflectionV1ProposalSourceManifestV2.sources.find(
    (source) => source.source_id === "quiet-trust-guided-audio-v1-rights",
  );
  assert.ok(golden);
  assert.equal(golden.provider_use_status, "metadata_only");
  assert.ok(rights);
  assert.equal(rights.provider_use_status, "forbidden");

  const original = strongrDailyContentProfileRegistryV1.profiles.find(
    (profile) => profile.profile_id === "guided_audio_reflection",
  );
  assert.ok(original);
  assert.equal(original.lifecycle, "source_required");
  assert.equal(original.activation_status, "inactive");
  assert.equal(original.content_type, "guided_audio_reflection");
  assert.equal(
    original.canonical_checksum,
    "5b838ddbeab4f7d638f7f00dbcd8356bbc1dc9f8c63aa3267de25a76e8991c64",
  );
});

test("golden prose, private responses, and unlicensed Scripture remain outside provider authority", () => {
  const golden = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "docs/business/content-profiles/guided-audio-reflection/quiet-trust-golden-example.v1.json",
      ),
      "utf8",
    ),
  );
  const rights = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "docs/business/content-profiles/guided-audio-reflection/quiet-trust-rights.v1.json",
      ),
      "utf8",
    ),
  );

  assert.equal(golden.public_repository_contains_prose, false);
  assert.equal(golden.provider_projection.raw_prose_permitted, false);
  assert.equal(golden.provider_projection.scripture_text_permitted, false);
  assert.equal(golden.provider_projection.close_copying_permitted, false);
  assert.equal(golden.authority_scope_owner_approved, false);

  assert.equal(rights.uses.raw_prose_provider_use, "forbidden");
  assert.equal(rights.scripture.provider_use, "metadata_only");
  assert.match(rights.scripture.spoken_use, /^forbidden/);
  assert.match(rights.scripture.full_or_partial_text_storage, /^forbidden/);
  assert.equal(rights.privacy.private_prayer_or_journal_content_present, false);
  assert.equal(rights.privacy.private_user_content_provider_use, "forbidden");
  assert.equal(rights.owner_gate.exact_profile_activation_approved, false);
  assert.equal(rights.owner_gate.provider_spend_approved, false);
  assert.equal(rights.owner_gate.publication_approved, false);
});
