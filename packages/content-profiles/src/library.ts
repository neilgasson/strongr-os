import {
  computeContentProfileChecksum,
  computeContentProfileRegistryChecksum,
  computeContentProfileSourceManifestChecksum,
} from "./canonical.ts";
import {
  parseContentProfileRegistry,
  parseContentProfileSelection,
  parseContentProfileSourceManifest,
  type ContentProfile,
  type ContentProfileRegistry,
  type ContentProfileSelection,
  type ContentProfileSourceManifest,
} from "./schema.ts";

export type ContentProfileLibraryErrorCode =
  | "content_profile_activation_forbidden"
  | "content_profile_approved_example_invalid"
  | "content_profile_checksum_invalid"
  | "content_profile_content_type_mismatch"
  | "content_profile_duplicate"
  | "content_profile_library_schema_invalid"
  | "content_profile_not_found"
  | "content_profile_range_invalid"
  | "content_profile_resolution_disabled"
  | "content_profile_registry_checksum_invalid"
  | "content_profile_selection_invalid"
  | "content_profile_selection_checksum_mismatch"
  | "content_profile_source_duplicate"
  | "content_profile_source_manifest_checksum_invalid"
  | "content_profile_source_manifest_mismatch"
  | "content_profile_source_missing"
  | "content_profile_structure_invalid"
  | "content_profile_version_not_found";

export class ContentProfileLibraryError extends Error {
  readonly code: ContentProfileLibraryErrorCode;

  constructor(code: ContentProfileLibraryErrorCode) {
    super(code);
    this.name = "ContentProfileLibraryError";
    this.code = code;
  }
}

export interface ContentProfileLibrary {
  readonly registry: ContentProfileRegistry;
  readonly sourceManifest: ContentProfileSourceManifest;
}

function fail(code: ContentProfileLibraryErrorCode): never {
  throw new ContentProfileLibraryError(code);
}

function assertUnique(values: readonly string[], code: ContentProfileLibraryErrorCode): void {
  if (new Set(values).size !== values.length) fail(code);
}

function validateRange(range: {
  readonly maximum: number;
  readonly minimum: number;
  readonly target?: number;
}): void {
  if (range.minimum > range.maximum) fail("content_profile_range_invalid");
  if (
    range.target !== undefined &&
    (range.target < range.minimum || range.target > range.maximum)
  ) {
    fail("content_profile_range_invalid");
  }
}

function validateProfileStructure(profile: ContentProfile): void {
  assertUnique(profile.source_ids, "content_profile_structure_invalid");
  assertUnique(profile.approved_source_example_ids, "content_profile_structure_invalid");
  assertUnique(
    profile.sections.map((section) => section.section_id),
    "content_profile_structure_invalid",
  );
  const citedSourceIds = [
    ...(profile.purpose_and_audience?.source_ids ?? []),
    ...profile.sections.flatMap((section) => section.guidance.flatMap((entry) => entry.source_ids)),
    ...Object.values(profile.rules).flatMap((entries) =>
      entries.flatMap((entry) => entry.source_ids),
    ),
  ];
  for (const sourceId of citedSourceIds) {
    if (!profile.source_ids.includes(sourceId)) fail("content_profile_structure_invalid");
  }
  assertUnique(
    profile.sections.map((section) => String(section.order)),
    "content_profile_structure_invalid",
  );
  const range = profile.expected_duration_and_length;
  if (range?.duration_seconds) validateRange(range.duration_seconds);
  if (range?.word_count) validateRange(range.word_count);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createContentProfileLibrary(input: {
  readonly registry: unknown;
  readonly sourceManifest: unknown;
}): ContentProfileLibrary {
  let registry: ContentProfileRegistry;
  let sourceManifest: ContentProfileSourceManifest;
  try {
    registry = parseContentProfileRegistry(input.registry);
    sourceManifest = parseContentProfileSourceManifest(input.sourceManifest);
  } catch {
    fail("content_profile_library_schema_invalid");
  }

  if (
    computeContentProfileSourceManifestChecksum(sourceManifest) !==
    sourceManifest.canonical_checksum
  ) {
    fail("content_profile_source_manifest_checksum_invalid");
  }
  if (computeContentProfileRegistryChecksum(registry) !== registry.canonical_checksum) {
    fail("content_profile_registry_checksum_invalid");
  }
  if (registry.source_manifest_checksum !== sourceManifest.canonical_checksum) {
    fail("content_profile_source_manifest_mismatch");
  }

  assertUnique(
    sourceManifest.sources.map((source) => source.source_id),
    "content_profile_source_duplicate",
  );
  assertUnique(
    registry.profiles.map((profile) => `${profile.profile_id}@${profile.profile_version}`),
    "content_profile_duplicate",
  );

  const sources = new Map(sourceManifest.sources.map((source) => [source.source_id, source]));
  for (const profile of registry.profiles) {
    const lifecycleIsActive = profile.lifecycle === "active";
    if ((profile.activation_status === "active") !== lifecycleIsActive) {
      fail("content_profile_structure_invalid");
    }
    if (lifecycleIsActive) {
      fail("content_profile_activation_forbidden");
    }
    if (computeContentProfileChecksum(profile) !== profile.canonical_checksum) {
      fail("content_profile_checksum_invalid");
    }
    validateProfileStructure(profile);
    for (const sourceId of profile.source_ids) {
      if (!sources.has(sourceId)) fail("content_profile_source_missing");
    }
    for (const sourceId of profile.approved_source_example_ids) {
      if (!profile.source_ids.includes(sourceId)) {
        fail("content_profile_approved_example_invalid");
      }
      const source = sources.get(sourceId);
      if (
        source?.source_kind !== "approved_example" ||
        source.status !== "approved" ||
        !source.approved_as_normative ||
        !source.source_sha256
      ) {
        fail("content_profile_approved_example_invalid");
      }
    }
  }

  return deepFreeze({ registry, sourceManifest });
}

export function inspectContentProfile(
  library: ContentProfileLibrary,
  identity: { readonly profile_id: string; readonly profile_version: number },
): ContentProfile {
  const matchingId = library.registry.profiles.filter(
    (profile) => profile.profile_id === identity.profile_id,
  );
  if (matchingId.length === 0) fail("content_profile_not_found");
  const profile = matchingId.find(
    (candidate) => candidate.profile_version === identity.profile_version,
  );
  if (!profile) fail("content_profile_version_not_found");
  return profile;
}

export function resolveContentProfile(
  library: ContentProfileLibrary,
  input: unknown,
): ContentProfile {
  let selection: ContentProfileSelection;
  try {
    selection = parseContentProfileSelection(input);
  } catch {
    fail("content_profile_selection_invalid");
  }
  const profile = inspectContentProfile(library, selection);
  if (profile.content_type !== selection.content_type) {
    fail("content_profile_content_type_mismatch");
  }
  if (profile.canonical_checksum !== selection.canonical_checksum) {
    fail("content_profile_selection_checksum_mismatch");
  }
  fail("content_profile_resolution_disabled");
}
