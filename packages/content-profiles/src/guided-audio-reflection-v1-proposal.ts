import { createContentProfileLibrary } from "./library.ts";
import {
  contentProfileRegistrySchemaId,
  contentProfileSchemaId,
  type ContentProfileSelection,
  contentProfileSourceManifestSchemaId,
  parseContentProfileSelection,
  type UnsignedContentProfile,
  type UnsignedContentProfileRegistry,
  type UnsignedContentProfileSourceManifest,
} from "./schema.ts";
import { strongrDailyContentProfileSourceManifestV1 } from "./strongr-daily-v1.ts";

const policySourceId = "phase-4b2-policy-decisions";
const profileRulesSourceId = "guided-audio-reflection-v1-rules";
const goldenExampleSourceId = "quiet-trust-guided-audio-v1";
const rightsSourceId = "quiet-trust-guided-audio-v1-rights";

const proposalSourceIds = [
  policySourceId,
  profileRulesSourceId,
  goldenExampleSourceId,
  rightsSourceId,
];

const proposalSourceManifestWithoutChecksum: UnsignedContentProfileSourceManifest = {
  manifest_version: 2,
  schema_id: contentProfileSourceManifestSchemaId,
  sources: [
    ...strongrDailyContentProfileSourceManifestV1.sources,
    {
      approved_as_normative: true,
      locator: "docs/business/STRONGR_DAILY_PHASE_4B_2_POLICY_DECISIONS.md",
      provider_use_status: "approved",
      rights_status: "repository_source",
      source_id: policySourceId,
      source_kind: "documentation",
      source_revision: "sha256:e9f2d3d033953c1c7aa1aa9e52d667f0084f7fe2d5880e4fd265c8a2d8a9be3f",
      source_sha256: "e9f2d3d033953c1c7aa1aa9e52d667f0084f7fe2d5880e4fd265c8a2d8a9be3f",
      status: "approved",
      title: "Strongr Daily Phase 4B.2 content-policy decisions",
    },
    {
      approved_as_normative: true,
      locator:
        "docs/business/content-profiles/guided-audio-reflection/STRONGR_DAILY_GUIDED_AUDIO_REFLECTION_PROFILE_V1.md",
      provider_use_status: "approved",
      rights_status: "repository_source",
      source_id: profileRulesSourceId,
      source_kind: "style_guidance",
      source_revision: "sha256:1a0dd7f03d95a3fbf3c65abf63fc261f364d1f42621e2c4229c4625e6679585f",
      source_sha256: "1a0dd7f03d95a3fbf3c65abf63fc261f364d1f42621e2c4229c4625e6679585f",
      status: "approved",
      title: "Strongr Daily guided audio reflection profile v1 rules",
    },
    {
      approved_as_normative: true,
      locator:
        "docs/business/content-profiles/guided-audio-reflection/quiet-trust-golden-example.v1.json",
      provider_use_status: "metadata_only",
      rights_status: "approved",
      source_id: goldenExampleSourceId,
      source_kind: "approved_example",
      source_revision: "sha256:fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882",
      source_sha256: "fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882",
      status: "approved",
      title: "Quiet Trust private golden-example descriptor v1",
    },
    {
      approved_as_normative: true,
      locator: "docs/business/content-profiles/guided-audio-reflection/quiet-trust-rights.v1.json",
      provider_use_status: "forbidden",
      rights_status: "approved",
      source_id: rightsSourceId,
      source_kind: "project_record",
      source_revision: "sha256:effe9ead79efc9661fa2bdebcdcef86543708a7a9e76bacc245a0607cf35ca68",
      source_sha256: "effe9ead79efc9661fa2bdebcdcef86543708a7a9e76bacc245a0607cf35ca68",
      status: "approved",
      title: "Quiet Trust scoped rights record v1",
    },
  ],
};

export const guidedAudioReflectionV1ProposalSourceManifestV2 = {
  ...proposalSourceManifestWithoutChecksum,
  canonical_checksum: "565962f24197e7e603d00aa8f8f4bf6c2fed1325dbd7f435e28aa45159aad7cc",
};

const cited = (guidance: string, source_ids: string[] = [profileRulesSourceId]) => ({
  guidance,
  source_ids,
});

const guidedAudioReflectionV1ProposalWithoutChecksum: UnsignedContentProfile = {
  activation_status: "inactive",
  approved_source_example_ids: [goldenExampleSourceId],
  content_type: "audio_reflection",
  display_name: "Guided audio reflection",
  expected_duration_and_length: {
    duration_seconds: { maximum: 330, minimum: 270, target: 300 },
  },
  format_variant: "guided_v1",
  lifecycle: "owner_review",
  profile_id: "guided_audio_reflection",
  profile_version: 1,
  purpose_and_audience: {
    audiences: ["Adults seeking a warm, peaceful, reverent daily Christian faith experience."],
    purpose:
      "Create a Christ-centred and Scripture-rooted approximately five-minute guided audio reflection as a governed first draft only.",
    source_ids: [policySourceId, profileRulesSourceId],
  },
  rules: {
    closing_language: [
      cited(
        "End with a gentle closing invitation that does not promise a result or imply automatic release.",
      ),
    ],
    introduction_and_welcome_style: [
      cited(
        "Use a warm, peaceful, welcoming, reverent, pastoral, modern, and accessible welcome before introducing Scripture.",
      ),
    ],
    narration_and_elevenlabs_formatting: [
      cited(
        "Produce one complete, locked, provider-neutral plain-text narration script as the only spoken provider input. It includes the welcome, biblical narrative, Christ-centred reflection and takeaway, full prayer, spoken closing invitation, and any spoken Daily Practice; exclude SSML, vendor markup, stage directions, music instructions, and pronunciation notes.",
      ),
    ],
    personal_takeaway_and_journal_prompts: [
      cited(
        "Include one optional public editorial personal-takeaway prompt; never consume, infer, retain, or expose a listener's private response.",
        [policySourceId, profileRulesSourceId],
      ),
    ],
    prayer_style_and_expected_length: [
      cited(
        "Write a concise public editorial prayer for the reflection, never a user prayer request and never derived from private prayer, journal, care, crisis, or personal-response text.",
        [policySourceId, profileRulesSourceId],
      ),
    ],
    prohibited_language_and_framing: [
      cited(
        "Forbid prosperity-gospel framing, guaranteed outcomes, claims that AI speaks for God, invented or unlicensed Scripture wording, close copying, private-user data, human-review impersonation, and automatic approval or publication.",
        [policySourceId, profileRulesSourceId, rightsSourceId],
      ),
    ],
    reflection_or_teaching_depth: [
      cited(
        "For story-based briefs, make the biblical account the primary vehicle: distinguish Scripture, historical context, and restrained imaginative reflection; remain Christ-centred, historically grounded, reverent, and free of invented facts or unsupported certainty.",
      ),
    ],
    scripture_placement_and_translation_handling: [
      cited(
        "Use the brief's exact Scripture reference, translation label, and source citation as metadata; quote or speak Scripture wording only when an exact rights record expressly permits that use.",
        [profileRulesSourceId, rightsSourceId],
      ),
    ],
    series_continuity_rules: [
      cited(
        "Treat the item as standalone unless an approved brief and series manifest explicitly provide continuity; never invent prior or future episodes.",
      ),
    ],
    study_questions_and_learning_structure: [
      cited(
        "Do not turn the reflection into a Bible study or add study questions; the governed supporting prompt is the personal takeaway only.",
      ),
    ],
    theological_and_editorial_boundaries: [
      cited(
        "Remain Christ-centred and Scripture-rooted while preserving separate human Scripture, theological or pastoral, and editorial review and AAL2 exact-version approval.",
        [policySourceId, profileRulesSourceId],
      ),
    ],
    title_description_artwork_and_app_metadata: [
      cited(
        "Nest the final title, Scripture metadata, app description, short summary, personal takeaway prompt, artwork prompt, social caption, keywords, narration-ready text, and duration estimate within the same governed draft; none is a separate profile or approval path.",
        [policySourceId, profileRulesSourceId],
      ),
      cited(
        "Keep supporting outputs faithful to the brief, free of unsupported promises, and avoid depicting generated media as authoritative divine speech.",
      ),
    ],
  },
  schema_id: contentProfileSchemaId,
  sections: [
    {
      guidance: [
        cited("Open with a calm, warm welcome suited to the approved brief and audience."),
      ],
      name: "Warm welcome",
      order: 1,
      requirement: "required",
      section_id: "warm_welcome",
    },
    {
      guidance: [
        cited(
          "Introduce the exact Scripture reference and pastoral focus without assuming quotation rights.",
          [profileRulesSourceId, rightsSourceId],
        ),
      ],
      name: "Scripture introduction",
      order: 2,
      requirement: "required",
      section_id: "scripture_introduction",
    },
    {
      guidance: [cited("Offer a substantive, brief-faithful pastoral reflection.")],
      name: "Reflection",
      order: 3,
      requirement: "required",
      section_id: "reflection",
    },
    {
      guidance: [cited("Offer a public editorial prayer that contains no private-user content.")],
      name: "Prayer",
      order: 4,
      requirement: "required",
      section_id: "prayer",
    },
    {
      guidance: [cited("End with a gentle invitation consistent with the approved brief.")],
      name: "Closing invitation",
      order: 5,
      requirement: "required",
      section_id: "closing_invitation",
    },
  ],
  source_ids: proposalSourceIds,
  source_manifest_version: 2,
  unresolved_decisions: [
    "Exact owner approval of this checksum-bound proposal for a future separately reviewed development-only activation remains required.",
  ],
};

export const guidedAudioReflectionV1Proposal = {
  ...guidedAudioReflectionV1ProposalWithoutChecksum,
  canonical_checksum: "920189adc84698ea9502d2eb6ac48b4e95b79d022a34d3a26ae318324791238a",
};

const proposalRegistryWithoutChecksum: UnsignedContentProfileRegistry = {
  activation_policy: "disabled_pending_owner_review",
  library_id: "strongr_daily",
  profiles: [guidedAudioReflectionV1Proposal],
  registry_version: 2,
  schema_id: contentProfileRegistrySchemaId,
  source_manifest_checksum: guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
};

export const guidedAudioReflectionV1ProposalRegistryV2 = {
  ...proposalRegistryWithoutChecksum,
  canonical_checksum: "517e4abcff9af4cbc44cd6d2400b9ac9f1b99a7abb3cc1b51831a34226b2028a",
};

/**
 * Review metadata only. Eligibility lets the owner review the exact identity;
 * it grants no runtime authority in this slice.
 */
export const guidedAudioReflectionV1ProposalOwnerGate = Object.freeze({
  activation_authorized: false,
  eligible_for_owner_approval: true,
  future_activation_scope: "development_only" as const,
  owner_approval_status: "pending" as const,
  profile_checksum: guidedAudioReflectionV1Proposal.canonical_checksum,
  profile_id: guidedAudioReflectionV1Proposal.profile_id,
  profile_resolution_authorized: false,
  profile_version: guidedAudioReflectionV1Proposal.profile_version,
  provider_call_authorized: false,
  provider_spend_authorized: false,
  source_manifest_checksum: guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
});

/**
 * Compares an untrusted future activation candidate with the exact proposal.
 * Even an exact match remains unauthorized until a later owner-approved slice
 * deliberately replaces the fail-closed authority flags.
 */
export function assessGuidedAudioReflectionV1ActivationCandidate(
  input: unknown,
  sourceManifestChecksum: unknown,
): Readonly<{
  activation_authorized: false;
  eligible_for_owner_approval: boolean;
  exact_candidate: boolean;
  profile_resolution_authorized: false;
  provider_call_authorized: false;
}> {
  let selection: ContentProfileSelection | undefined;
  try {
    selection = parseContentProfileSelection(input);
  } catch {
    selection = undefined;
  }

  const exactCandidate =
    selection?.profile_id === guidedAudioReflectionV1Proposal.profile_id &&
    selection.profile_version === guidedAudioReflectionV1Proposal.profile_version &&
    selection.content_type === guidedAudioReflectionV1Proposal.content_type &&
    selection.canonical_checksum === guidedAudioReflectionV1Proposal.canonical_checksum &&
    sourceManifestChecksum === guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum;

  return Object.freeze({
    activation_authorized: false,
    eligible_for_owner_approval: exactCandidate,
    exact_candidate: exactCandidate,
    profile_resolution_authorized: false,
    provider_call_authorized: false,
  });
}

export const guidedAudioReflectionV1ProposalLibrary = createContentProfileLibrary({
  registry: guidedAudioReflectionV1ProposalRegistryV2,
  sourceManifest: guidedAudioReflectionV1ProposalSourceManifestV2,
});
