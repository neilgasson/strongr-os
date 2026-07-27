import assert from "node:assert/strict";
import test from "node:test";

import type { Uuid } from "../../../packages/contracts/src/index.ts";
import { loadCanonicalWorkQueue, type StudioWorkQueueGateway } from "../src/work-queue.ts";

const organizationId = "00000000-0000-4000-8000-000000000001";
const versionId = "00000000-0000-4000-8000-000000000002";
const approvalId = "00000000-0000-4000-8000-000000000003";
const artifactId = "00000000-0000-4000-8000-000000000004";
const stagedReleaseId = "00000000-0000-4000-8000-000000000005";

function fixtureGateway(overrides: Partial<StudioWorkQueueGateway> = {}): StudioWorkQueueGateway {
  const empty = () => Promise.resolve([]);
  return {
    downloadMediaArtifact: async () => {
      throw new Error("not used");
    },
    getMediaArtifact: async () => {
      throw new Error("not used");
    },
    listApprovalRevocations: empty,
    listApprovalSnapshots: () =>
      Promise.resolve([
        {
          authenticationAssurance: "aal2",
          approvedAt: "2026-07-27T00:00:00.000Z",
          checkRunId: "00000000-0000-4000-8000-000000000010",
          contentVersionId: versionId,
          evidenceBundleHash: "b".repeat(64),
          id: approvalId,
          organizationId,
          reasonCode: "accepted",
          reviewPolicyId: "00000000-0000-4000-8000-000000000011",
          rightsSnapshotId: "00000000-0000-4000-8000-000000000012",
          scriptureEvidenceId: "00000000-0000-4000-8000-000000000013",
          versionPayloadHash: "a".repeat(64),
        },
      ]),
    listBriefs: () =>
      Promise.resolve([
        {
          contentItemId: "00000000-0000-4000-8000-000000000014",
          createdAt: "2026-07-27T00:00:00.000Z",
          id: "00000000-0000-4000-8000-000000000015",
          organizationId,
          payloadHash: "a".repeat(64),
          schemaId: "strongr.audio_reflection_brief.v1",
        },
      ]),
    listCheckDefinitions: empty,
    listCheckResults: empty,
    listCheckRuns: empty,
    listContentVersions: () =>
      Promise.resolve([
        {
          briefId: "00000000-0000-4000-8000-000000000015",
          contentItemId: "00000000-0000-4000-8000-000000000014",
          createdAt: "2026-07-27T00:00:00.000Z",
          id: versionId,
          organizationId,
          payload: {},
          payloadHash: "a".repeat(64),
          schemaId: "strongr.audio_reflection.v1",
          source: "manual",
          sourceJobId: null,
          state: "submitted",
          submittedAt: "2026-07-27T00:00:00.000Z",
          versionNumber: 1,
        },
      ]),
    listGenerationJobs: () =>
      Promise.resolve([
        {
          attemptCount: 0,
          briefId: "00000000-0000-4000-8000-000000000015",
          createdAt: "2026-07-27T00:00:00.000Z",
          finishedAt: null,
          id: "00000000-0000-4000-8000-000000000016",
          organizationId,
          outputHash: null,
          state: "queued",
        },
      ]),
    listMediaArtifacts: () =>
      Promise.resolve([
        {
          bitsPerSample: 16,
          bucketId: "strongr-os-media",
          byteCount: 100,
          channels: 1,
          codec: "pcm_s16le",
          container: "wav",
          createdAt: "2026-07-27T00:00:00.000Z",
          durationMs: 10,
          id: artifactId,
          mediaJobId: "00000000-0000-4000-8000-000000000017",
          mimeType: "audio/wav",
          objectPath: "private.wav",
          organizationId,
          outputSpecId: "00000000-0000-4000-8000-000000000018",
          productionPackageId: "00000000-0000-4000-8000-000000000019",
          sampleRateHz: 16000,
          sha256: "c".repeat(64),
          successfulAttemptId: "00000000-0000-4000-8000-000000000020",
          validatedAt: "2026-07-27T00:00:00.000Z",
          validationSchemaId: "strongr.media_validation.v1",
        },
      ]),
    listMediaJobs: empty,
    listMediaOutputSpecs: empty,
    listMediaReviews: empty,
    listProductionPackages: empty,
    listReviewDecisions: empty,
    listReviewPolicies: empty,
    listRightsSnapshots: empty,
    listScriptureEvidence: empty,
    listStagedReleaseBundles: () =>
      Promise.resolve([
        {
          authenticationAssurance: "aal2",
          id: stagedReleaseId,
          manifest: {},
          manifestHash: "d".repeat(64),
          manifestSchemaId: "strongr.staged_release_bundle.v1",
          mediaArtifactId: artifactId,
          mediaReviewId: "00000000-0000-4000-8000-000000000021",
          organizationId,
          productionPackageId: "00000000-0000-4000-8000-000000000019",
          stagedAt: "2026-07-27T00:00:00.000Z",
          stagedByMembershipId: "00000000-0000-4000-8000-000000000022",
        },
      ]),
    listStagedReleaseRevocations: () =>
      Promise.resolve([
        {
          authenticationAssurance: "aal2",
          id: "00000000-0000-4000-8000-000000000023",
          organizationId,
          reasonCode: "withdrawn",
          revokedAt: "2026-07-27T00:00:00.000Z",
          revokedByMembershipId: "00000000-0000-4000-8000-000000000022",
          stagedReleaseBundleId: stagedReleaseId,
        },
      ]),
    ...overrides,
  } as StudioWorkQueueGateway;
}

test("canonical queue distinguishes attention, exact counts, and revocations", async () => {
  const snapshot = await loadCanonicalWorkQueue(
    fixtureGateway(),
    organizationId,
    () => new Date("2026-07-27T12:00:00.000Z"),
  );
  const byKey = new Map(snapshot.lanes.map((lane) => [lane.key, lane]));

  assert.equal(snapshot.loadedAt, "2026-07-27T12:00:00.000Z");
  assert.deepEqual(
    Object.fromEntries([...byKey].map(([key, value]) => [key, [value.count, value.status]])),
    {
      artifacts: [1, "attention"],
      briefs: [1, "ready"],
      generation: [1, "attention"],
      mediaJobs: [0, "ready"],
      packages: [0, "ready"],
      reviews: [0, "ready"],
      revocations: [1, "ready"],
      staged: [0, "ready"],
      versions: [1, "ready"],
    },
  );
});

test("a failed canonical lane is explicit instead of becoming an empty success", async () => {
  const snapshot = await loadCanonicalWorkQueue(
    fixtureGateway({
      listGenerationJobs: () => Promise.reject(new Error("private database detail")),
    }),
    organizationId as Uuid,
  );
  const generation = snapshot.lanes.find(({ key }) => key === "generation");
  assert.deepEqual(generation, {
    count: 0,
    detail: "Canonical status could not be loaded. No success is assumed.",
    key: "generation",
    label: "Generation",
    status: "failed",
  });
  assert.equal(JSON.stringify(snapshot).includes("private database detail"), false);
});
