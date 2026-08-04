import { canonicalSha256 } from "./canonical.ts";
import {
  guidedAudioReflectionV1Proposal,
  guidedAudioReflectionV1ProposalSourceManifestV2,
} from "./guided-audio-reflection-v1-proposal.ts";

const goldenDescriptorChecksum = "fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882";
const rightsRecordChecksum = "effe9ead79efc9661fa2bdebcdcef86543708a7a9e76bacc245a0607cf35ca68";

export const quietTrustDevelopmentPilotRequestId = "quiet_trust_development_pilot_v1" as const;

/**
 * The complete, reviewable provider-safe brief for the single future pilot.
 * This is reference metadata only: it intentionally contains no Bible text,
 * private response, journal material, or golden-example prose.
 */
export const quietTrustDevelopmentPilotBrief = Object.freeze({
  audience: "Adults seeking a calm, Scripture-grounded Christian reflection and prayer.",
  content_profile: Object.freeze({
    canonical_checksum: guidedAudioReflectionV1Proposal.canonical_checksum,
    content_type: "audio_reflection" as const,
    profile_id: "guided_audio_reflection" as const,
    profile_version: 1 as const,
  }),
  content_type: "audio_reflection" as const,
  desired_duration_seconds: 300,
  pastoral_purpose:
    "Offer a warm, Christ-centred reflection on stillness and trust that remains an unapproved development draft for human review.",
  prohibited_claims_or_wording: Object.freeze([
    "Do not quote, paraphrase, or reproduce full Scripture text.",
    "Do not use private prayer, journal, mood, care, crisis, or other user data.",
    "Do not reproduce unpublished golden-example prose or closely imitate it.",
    "Do not make prosperity claims, guarantees, or claims that God or AI has spoken directly to the listener.",
    "Do not claim that Scripture, theological, pastoral, editorial, or rights review has occurred.",
    "Do not approve, narrate, upload, publish, release, or otherwise operationalize the draft.",
  ]),
  required_elements: Object.freeze([
    "A warm welcome.",
    "A Scripture introduction using only the approved reference and translation metadata.",
    "A reflective, Christ-centred section focused on stillness and trust.",
    "One public editorial prayer.",
    "A gentle closing invitation without a promised outcome.",
  ]),
  schema_id: "strongr.strongr_daily_audio_reflection_brief.v2" as const,
  scripture_reference: Object.freeze({
    reference: "Psalm 46:10",
    source_citation: "New International Version (reference metadata only; no quotation authorized)",
    translation: "NIV",
  }),
  source_brief_identifier: quietTrustDevelopmentPilotRequestId,
  theme: "Stillness and trust in God.",
  tone: "pastoral" as const,
  working_title: "Quiet Trust",
});

export const quietTrustDevelopmentPilotJob = Object.freeze({
  approved_checksums: Object.freeze({
    golden_descriptor: goldenDescriptorChecksum,
    profile: guidedAudioReflectionV1Proposal.canonical_checksum,
    rights_record: rightsRecordChecksum,
    source_manifest: guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
  }),
  dispatch_status: "prepared_not_sent" as const,
  future_dispatch_limit: 1,
  generation_authority: false,
  provider_access: false,
  provider_spending_cap_microunits: 0,
  request_id: quietTrustDevelopmentPilotRequestId,
  runtime_generation_authority: false,
});

export const quietTrustDevelopmentPilotBriefChecksum = canonicalSha256(
  quietTrustDevelopmentPilotBrief,
);
export const quietTrustDevelopmentPilotJobChecksum = canonicalSha256(quietTrustDevelopmentPilotJob);

export type QuietTrustDispatchErrorCode =
  | "phase_4b6_dispatch_not_authorized"
  | "phase_4b6_invalid_request"
  | "phase_4b6_integrity_mismatch";

export class QuietTrustDispatchPreparationError extends Error {
  readonly code: QuietTrustDispatchErrorCode;

  constructor(code: QuietTrustDispatchErrorCode) {
    super(code);
    this.name = "QuietTrustDispatchPreparationError";
    this.code = code;
  }
}

/**
 * The endpoint-facing contract is deliberately fail-closed. A future phase may
 * supply a separately approved authorization, but this phase cannot dispatch.
 */
export function prepareQuietTrustDevelopmentDispatch(requestId: unknown) {
  if (requestId !== quietTrustDevelopmentPilotRequestId) {
    throw new QuietTrustDispatchPreparationError("phase_4b6_invalid_request");
  }
  if (
    quietTrustDevelopmentPilotJob.dispatch_status !== "prepared_not_sent" ||
    quietTrustDevelopmentPilotJob.generation_authority ||
    quietTrustDevelopmentPilotJob.provider_access ||
    quietTrustDevelopmentPilotJob.runtime_generation_authority ||
    quietTrustDevelopmentPilotJob.provider_spending_cap_microunits !== 0
  ) {
    throw new QuietTrustDispatchPreparationError("phase_4b6_integrity_mismatch");
  }
  throw new QuietTrustDispatchPreparationError("phase_4b6_dispatch_not_authorized");
}
