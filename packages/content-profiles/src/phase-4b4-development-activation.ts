import {
  guidedAudioReflectionV1Proposal,
  guidedAudioReflectionV1ProposalSourceManifestV2,
} from "./guided-audio-reflection-v1-proposal.ts";

export const phase4B4ApprovedGoldenDescriptorChecksum =
  "fffa3521b410a614bd3c9cc3b5485d75ffa2510a378ec8b46bc38e543ca45882" as const;
export const phase4B4ApprovedRightsRecordChecksum =
  "effe9ead79efc9661fa2bdebcdcef86543708a7a9e76bacc245a0607cf35ca68" as const;

export type Phase4B4DevelopmentRegistration = Readonly<{
  activation_pending_owner_approval: true;
  golden_descriptor_checksum: typeof phase4B4ApprovedGoldenDescriptorChecksum;
  profile_checksum: typeof guidedAudioReflectionV1Proposal.canonical_checksum;
  profile_id: typeof guidedAudioReflectionV1Proposal.profile_id;
  profile_version: typeof guidedAudioReflectionV1Proposal.profile_version;
  provider_access: false;
  provider_spending: 0;
  publication_enabled: false;
  rights_record_checksum: typeof phase4B4ApprovedRightsRecordChecksum;
  runtime_generation_authority: false;
  source_manifest_checksum: typeof guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum;
  state: "registered_pending_owner_approval";
}>;

export type Phase4B4InactiveDevelopmentState = Readonly<{
  activation_pending_owner_approval: true;
  provider_access: false;
  provider_spending: 0;
  publication_enabled: false;
  runtime_generation_authority: false;
  state: "inactive";
}>;

export class Phase4B4DevelopmentActivationError extends Error {
  readonly code: "phase_4b4_registration_rejected";

  constructor(code: "phase_4b4_registration_rejected") {
    super(code);
    this.name = "Phase4B4DevelopmentActivationError";
    this.code = code;
  }
}

const expectedRegistration = Object.freeze({
  golden_descriptor_checksum: phase4B4ApprovedGoldenDescriptorChecksum,
  profile_checksum: guidedAudioReflectionV1Proposal.canonical_checksum,
  profile_id: guidedAudioReflectionV1Proposal.profile_id,
  profile_version: guidedAudioReflectionV1Proposal.profile_version,
  rights_record_checksum: phase4B4ApprovedRightsRecordChecksum,
  source_manifest_checksum: guidedAudioReflectionV1ProposalSourceManifestV2.canonical_checksum,
});

type RegistrationRequest = Readonly<typeof expectedRegistration>;

function isExactRegistrationRequest(input: unknown): input is RegistrationRequest {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
  const candidate = input as Record<string, unknown>;
  const expectedKeys = Object.keys(expectedRegistration).sort();
  if (Object.keys(candidate).sort().join("\u0000") !== expectedKeys.join("\u0000")) return false;
  return expectedKeys.every(
    (key) => candidate[key] === expectedRegistration[key as keyof RegistrationRequest],
  );
}

/**
 * Registers metadata for one reviewed development-only profile. It deliberately
 * accepts neither content nor provider configuration, and creates no runtime
 * generation authority. A future owner-approved slice must introduce any
 * activation capability separately.
 */
export function registerPhase4B4DevelopmentMetadata(
  input: unknown,
): Phase4B4DevelopmentRegistration {
  if (!isExactRegistrationRequest(input)) {
    throw new Phase4B4DevelopmentActivationError("phase_4b4_registration_rejected");
  }
  return Object.freeze({
    activation_pending_owner_approval: true,
    ...expectedRegistration,
    provider_access: false,
    provider_spending: 0,
    publication_enabled: false,
    runtime_generation_authority: false,
    state: "registered_pending_owner_approval" as const,
  });
}

/** No provider, runtime, or publication state is retained after rollback. */
export function rollbackPhase4B4DevelopmentMetadata(): Phase4B4InactiveDevelopmentState {
  return Object.freeze({
    activation_pending_owner_approval: true,
    provider_access: false,
    provider_spending: 0,
    publication_enabled: false,
    runtime_generation_authority: false,
    state: "inactive",
  });
}
