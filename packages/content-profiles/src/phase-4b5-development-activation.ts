import {
  type Phase4B4DevelopmentRegistration,
  rollbackPhase4B4DevelopmentMetadata,
} from "./phase-4b4-development-activation.ts";
import {
  guidedAudioReflectionV1Proposal,
  guidedAudioReflectionV1ProposalSourceManifestV2,
} from "./guided-audio-reflection-v1-proposal.ts";

const approvedActivationIdentity = Object.freeze({
  golden_descriptor_checksum: "fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882",
  profile_checksum: guidedAudioReflectionV1Proposal.canonical_checksum,
  profile_id: "guided_audio_reflection" as const,
  profile_version: 1 as const,
  rights_record_checksum: "effe9ead79efc9661fa2bdebcdcef86543708a7a9e76bacc245a0607cf35ca68",
  source_manifest_checksum: guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
});

export type Phase4B5DevelopmentActivation = Readonly<{
  activation_scope: "development_only";
  golden_descriptor_checksum: string;
  profile_checksum: string;
  profile_id: "guided_audio_reflection";
  profile_version: 1;
  provider_access: false;
  provider_spending: 0;
  publication_enabled: false;
  rights_record_checksum: string;
  runtime_generation_authority: false;
  source_manifest_checksum: string;
  state: "development_active";
}>;

export type Phase4B5QuietTrustRequest = Readonly<{
  content_included: false;
  dispatch_status: "prepared_not_sent";
  generation_authority: false;
  maximum_provider_calls: 1;
  maximum_provider_spend: 0;
  private_user_content_included: false;
  profile_id: "guided_audio_reflection";
  profile_version: 1;
  request_id: "quiet_trust_development_pilot_v1";
  scripture_text_included: false;
}>;

export class Phase4B5DevelopmentActivationError extends Error {
  readonly code: "phase_4b5_activation_rejected";

  constructor() {
    super("phase_4b5_activation_rejected");
    this.name = "Phase4B5DevelopmentActivationError";
    this.code = "phase_4b5_activation_rejected";
  }
}

function isApprovedRegistration(input: unknown): input is Phase4B4DevelopmentRegistration {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
  const candidate = input as Record<string, unknown>;
  return (
    candidate.state === "registered_pending_owner_approval" &&
    candidate.activation_pending_owner_approval === true &&
    candidate.provider_access === false &&
    candidate.provider_spending === 0 &&
    candidate.publication_enabled === false &&
    candidate.runtime_generation_authority === false &&
    Object.entries(approvedActivationIdentity).every(([key, value]) => candidate[key] === value)
  );
}

/**
 * Activates only the exact approved metadata identity for development review.
 * It deliberately grants no provider access or runtime generation authority.
 */
export function activatePhase4B5DevelopmentProfile(
  registration: unknown,
): Phase4B5DevelopmentActivation {
  if (!isApprovedRegistration(registration)) throw new Phase4B5DevelopmentActivationError();
  return Object.freeze({
    activation_scope: "development_only" as const,
    ...approvedActivationIdentity,
    provider_access: false,
    provider_spending: 0,
    publication_enabled: false,
    runtime_generation_authority: false,
    state: "development_active" as const,
  });
}

/**
 * Produces metadata for a single capped Quiet Trust pilot request, never provider input.
 */
export function preparePhase4B5QuietTrustRequest(activation: unknown): Phase4B5QuietTrustRequest {
  const candidate = activation as Record<string, unknown> | null;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    candidate.state !== "development_active" ||
    candidate.activation_scope !== "development_only" ||
    candidate.profile_id !== "guided_audio_reflection" ||
    candidate.profile_version !== 1 ||
    candidate.provider_access !== false ||
    candidate.provider_spending !== 0 ||
    candidate.publication_enabled !== false ||
    candidate.runtime_generation_authority !== false ||
    !Object.entries(approvedActivationIdentity).every(([key, value]) => candidate[key] === value)
  ) {
    throw new Phase4B5DevelopmentActivationError();
  }
  return Object.freeze({
    content_included: false,
    dispatch_status: "prepared_not_sent" as const,
    generation_authority: false,
    maximum_provider_calls: 1,
    maximum_provider_spend: 0,
    private_user_content_included: false,
    profile_id: "guided_audio_reflection" as const,
    profile_version: 1 as const,
    request_id: "quiet_trust_development_pilot_v1" as const,
    scripture_text_included: false,
  });
}

/** Exact approved profile state, active only within the development metadata boundary. */
export const phase4B5DevelopmentActivation: Phase4B5DevelopmentActivation = Object.freeze({
  activation_scope: "development_only" as const,
  ...approvedActivationIdentity,
  provider_access: false,
  provider_spending: 0,
  publication_enabled: false,
  runtime_generation_authority: false,
  state: "development_active" as const,
});

/** One capped request record; it contains no content and cannot be dispatched. */
export const phase4B5QuietTrustGenerationRequest: Phase4B5QuietTrustRequest =
  preparePhase4B5QuietTrustRequest(phase4B5DevelopmentActivation);

/** Restores the development-only profile path to its Phase 4B.4 inactive state. */
export const rollbackPhase4B5DevelopmentActivation = rollbackPhase4B4DevelopmentMetadata;
