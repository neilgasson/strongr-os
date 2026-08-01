import assert from "node:assert/strict";
import test from "node:test";

import { strongrDailyContentProfileSourceManifestV1 } from "../../../packages/content-profiles/src/strongr-daily-v1.ts";

import {
  contentProfileGateForBinding,
  contentProfileGateForOption,
  findStudioContentProfileOption,
  studioContentProfileOptions,
} from "../src/content-profile-foundation.ts";
import { isStudioGenerationSafeErrorCode } from "../src/foundation.ts";

test("Studio exposes every governed profile for review without activating one", () => {
  assert.ok(studioContentProfileOptions.length > 1);
  assert.equal(
    studioContentProfileOptions.some(({ profile }) => profile.lifecycle === "active"),
    false,
  );
  assert.equal(
    studioContentProfileOptions.every(({ statusLabel, statusSummary }) =>
      Boolean(statusLabel && statusSummary),
    ),
    true,
  );

  for (const option of studioContentProfileOptions) {
    assert.deepEqual(option.selection, {
      canonical_checksum: option.profile.canonical_checksum,
      content_type: option.profile.content_type,
      profile_id: option.profile.profile_id,
      profile_version: option.profile.profile_version,
    });
    assert.equal(findStudioContentProfileOption(option.key), option);
    assert.equal(contentProfileGateForOption(option).allowed, false);
  }
});

test("Studio fails closed when no exact profile is selected", () => {
  const gate = contentProfileGateForOption(null);

  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /choose a content format/i);
  assert.match(gate.reason, /no provider will be contacted/i);
});

test("Studio recognizes only the safe inactive-profile runtime diagnostic", () => {
  assert.equal(isStudioGenerationSafeErrorCode("content_profile_not_active"), true);
  assert.equal(isStudioGenerationSafeErrorCode("profile included secret payload"), false);
});

test("legacy saved work remains readable while generation stays locked", () => {
  const gate = contentProfileGateForBinding(null);

  assert.equal(gate.allowed, false);
  assert.equal(gate.profile, null);
  assert.match(gate.reason, /remains readable and exportable/i);
  assert.match(gate.reason, /generation is locked/i);
});

test("Studio rejects a checksum mismatch without guessing a replacement profile", () => {
  const option = studioContentProfileOptions[0];
  assert.ok(option);

  const gate = contentProfileGateForBinding({
    canonicalChecksum: "0".repeat(64),
    contentType: option.profile.content_type,
    profileId: option.profile.profile_id,
    profileVersion: option.profile.profile_version,
    sourceManifestChecksum: strongrDailyContentProfileSourceManifestV1.canonical_checksum,
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.profile, option.profile);
  assert.match(gate.reason, /does not match the governed library/i);
});

test("Studio rejects an unknown profile identity without choosing a fallback", () => {
  const gate = contentProfileGateForBinding({
    canonicalChecksum: "0".repeat(64),
    contentType: "audio_reflection",
    profileId: "unknown_profile",
    profileVersion: 1,
    sourceManifestChecksum: "0".repeat(64),
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.profile, null);
  assert.match(gate.reason, /exact content profile.*unavailable/i);
  assert.match(gate.reason, /generation is locked/i);
});

test("Studio rejects a source-manifest checksum mismatch", () => {
  const option = studioContentProfileOptions[0];
  assert.ok(option);
  const gate = contentProfileGateForBinding({
    canonicalChecksum: option.profile.canonical_checksum,
    contentType: option.profile.content_type,
    profileId: option.profile.profile_id,
    profileVersion: option.profile.profile_version,
    sourceManifestChecksum: "0".repeat(64),
  });
  assert.equal(gate.allowed, false);
  assert.match(gate.reason, /does not match the governed library/i);
});
