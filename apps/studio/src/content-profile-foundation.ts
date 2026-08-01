import {
  strongrDailyContentProfileRegistryV1,
  strongrDailyContentProfileSourceManifestV1,
} from "../../../packages/content-profiles/src/strongr-daily-v1.ts";
import type {
  ContentProfile,
  ContentProfileSelection,
} from "../../../packages/content-profiles/src/schema.ts";
import type { ContentProfileBinding } from "../../../packages/contracts/src/index.ts";

export interface StudioContentProfileOption {
  readonly key: string;
  readonly profile: ContentProfile;
  readonly selection: ContentProfileSelection;
  readonly statusLabel: string;
  readonly statusSummary: string;
}

export interface StudioContentProfileGate {
  readonly allowed: boolean;
  readonly profile: ContentProfile | null;
  readonly reason: string;
}

const lifecyclePresentation: Readonly<
  Record<ContentProfile["lifecycle"], Readonly<{ label: string; summary: string }>>
> = Object.freeze({
  active: Object.freeze({
    label: "Active",
    summary: "This exact profile version may be used for provider generation.",
  }),
  draft_unapproved: Object.freeze({
    label: "Draft profile — not approved",
    summary: "The profile is still being written and cannot be used for generation.",
  }),
  inventory_only: Object.freeze({
    label: "Recorded for inventory",
    summary:
      "This entry preserves an existing format, but it is not an approved generation profile.",
  }),
  owner_approved_inactive: Object.freeze({
    label: "Approved but not active",
    summary: "The owner approved this profile, but provider generation is still turned off.",
  }),
  owner_review: Object.freeze({
    label: "Waiting for owner review",
    summary: "The profile must be reviewed by the owner before it can be activated.",
  }),
  retired: Object.freeze({
    label: "Retired",
    summary: "This profile is preserved for history and cannot be used for new work.",
  }),
  source_required: Object.freeze({
    label: "Source material required",
    summary:
      "Approved source material is still missing, so this profile cannot be used for generation.",
  }),
  superseded: Object.freeze({
    label: "Replaced",
    summary: "A newer profile replaced this version. It remains visible for historical work only.",
  }),
});

export const studioContentProfileOptions: readonly StudioContentProfileOption[] = Object.freeze(
  strongrDailyContentProfileRegistryV1.profiles.map((profile) => {
    const presentation = lifecyclePresentation[profile.lifecycle];
    return Object.freeze({
      key: `${profile.profile_id}@${profile.profile_version}`,
      profile,
      selection: Object.freeze({
        canonical_checksum: profile.canonical_checksum,
        content_type: profile.content_type,
        profile_id: profile.profile_id,
        profile_version: profile.profile_version,
      }),
      statusLabel: presentation.label,
      statusSummary: presentation.summary,
    });
  }),
);

export function findStudioContentProfileOption(key: string): StudioContentProfileOption | null {
  return studioContentProfileOptions.find((option) => option.key === key) ?? null;
}

export function contentProfileGateForOption(
  option: StudioContentProfileOption | null,
): StudioContentProfileGate {
  if (!option) {
    return Object.freeze({
      allowed: false,
      profile: null,
      reason:
        "Choose a content format before continuing. No brief will be saved and no provider will be contacted until an exact profile version is active.",
    });
  }
  return contentProfileGateForBinding({
    canonicalChecksum: option.selection.canonical_checksum,
    contentType: option.selection.content_type,
    profileId: option.selection.profile_id,
    profileVersion: option.selection.profile_version,
    sourceManifestChecksum: strongrDailyContentProfileSourceManifestV1.canonical_checksum,
  });
}

export function contentProfileGateForBinding(
  binding: ContentProfileBinding | null,
): StudioContentProfileGate {
  if (!binding) {
    return Object.freeze({
      allowed: false,
      profile: null,
      reason:
        "This saved work has no governed content profile. It remains readable and exportable, but provider generation is locked.",
    });
  }

  const profile = strongrDailyContentProfileRegistryV1.profiles.find(
    (candidate) =>
      candidate.profile_id === binding.profileId &&
      candidate.profile_version === binding.profileVersion,
  );
  if (!profile) {
    return Object.freeze({
      allowed: false,
      profile: null,
      reason:
        "The exact content profile for this work is unavailable. The work remains readable, but provider generation is locked.",
    });
  }

  if (
    profile.canonical_checksum !== binding.canonicalChecksum ||
    profile.content_type !== binding.contentType ||
    strongrDailyContentProfileSourceManifestV1.canonical_checksum !== binding.sourceManifestChecksum
  ) {
    return Object.freeze({
      allowed: false,
      profile,
      reason:
        "The saved content profile does not match the governed library. The work remains readable, but provider generation is locked.",
    });
  }

  if (profile.lifecycle !== "active") {
    const presentation = lifecyclePresentation[profile.lifecycle];
    return Object.freeze({
      allowed: false,
      profile,
      reason: `${presentation.summary} Phase 4B.1 keeps every profile inactive until a later, explicit owner approval.`,
    });
  }

  return Object.freeze({
    allowed: true,
    profile,
    reason: "This exact profile version is active.",
  });
}
