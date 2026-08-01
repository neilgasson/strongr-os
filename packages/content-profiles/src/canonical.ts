import { createHash } from "node:crypto";

import type {
  ContentProfile,
  ContentProfileRegistry,
  ContentProfileSourceManifest,
  UnsignedContentProfile,
  UnsignedContentProfileRegistry,
  UnsignedContentProfileSourceManifest,
} from "./schema.ts";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical_json_non_finite_number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  throw new TypeError("canonical_json_unsupported_value");
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function withoutChecksum<T extends { readonly canonical_checksum: string }>(
  value: T,
): Omit<T, "canonical_checksum"> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "canonical_checksum"),
  ) as Omit<T, "canonical_checksum">;
}

export function computeContentProfileChecksum(
  profile: ContentProfile | UnsignedContentProfile,
): string {
  return canonicalSha256("canonical_checksum" in profile ? withoutChecksum(profile) : profile);
}

export function computeContentProfileRegistryChecksum(
  registry: ContentProfileRegistry | UnsignedContentProfileRegistry,
): string {
  return canonicalSha256("canonical_checksum" in registry ? withoutChecksum(registry) : registry);
}

export function computeContentProfileSourceManifestChecksum(
  manifest: ContentProfileSourceManifest | UnsignedContentProfileSourceManifest,
): string {
  return canonicalSha256("canonical_checksum" in manifest ? withoutChecksum(manifest) : manifest);
}
