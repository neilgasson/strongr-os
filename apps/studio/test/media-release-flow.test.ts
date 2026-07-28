import assert from "node:assert/strict";
import test from "node:test";

import type {
  BrowserCommandArguments,
  BrowserCommandName,
  BrowserCommandResult,
  M2TenantReadGateway,
  TenantReadGateway,
} from "../../../packages/contracts/src/index.ts";
import { fixtureIds } from "../../../packages/testing/src/index.ts";
import { MediaReleaseOperatorFlow } from "../src/index.ts";
import type { StudioCommandGateway } from "../src/index.ts";

const ids = Object.freeze({
  artifact: "00000000-0000-4000-8000-000000000041",
  job: "00000000-0000-4000-8000-000000000042",
  outputSpec: "00000000-0000-4000-8000-000000000043",
  package: "00000000-0000-4000-8000-000000000044",
  review: "00000000-0000-4000-8000-000000000045",
  stagedBundle: "00000000-0000-4000-8000-000000000046",
  stagedRevocation: "00000000-0000-4000-8000-000000000047",
});

function createTenantReads(observe: (tenant: string) => void = () => {}): TenantReadGateway {
  const tenantRead = (organizationId: string) => {
    observe(organizationId);
    return Promise.resolve([]);
  };
  return {
    listApprovalRevocations: tenantRead,
    listApprovalSnapshots: tenantRead,
    listBriefs: tenantRead,
    listCheckDefinitions: () => Promise.resolve([]),
    listCheckResults: tenantRead,
    listCheckRuns: tenantRead,
    listContentVersions: tenantRead,
    listGenerationJobs: tenantRead,
    listProductionPackages: tenantRead,
    listReviewDecisions: tenantRead,
    listReviewPolicies: tenantRead,
    listRightsSnapshots: tenantRead,
    listScriptureEvidence: tenantRead,
  };
}

function createMediaReads(observe: (tenant: string) => void = () => {}): M2TenantReadGateway {
  const tenantRead = (organizationId: string) => {
    observe(organizationId);
    return Promise.resolve([]);
  };
  return {
    downloadMediaArtifact(organizationId, mediaArtifactId) {
      observe(organizationId);
      return Promise.resolve({
        artifact: {
          bitsPerSample: 16,
          bucketId: "strongr-os-media",
          byteCount: 3,
          channels: 1,
          codec: "pcm_s16le",
          container: "wav",
          createdAt: "2026-07-27T00:00:00.000Z",
          durationMs: 1,
          id: mediaArtifactId,
          mediaJobId: ids.job,
          mimeType: "audio/wav",
          objectPath: `${organizationId}/${ids.package}/${mediaArtifactId}.wav`,
          organizationId,
          outputSpecId: ids.outputSpec,
          productionPackageId: ids.package,
          sampleRateHz: 16_000,
          sha256: "a".repeat(64),
          successfulAttemptId: fixtureIds.correlationId,
          validatedAt: "2026-07-27T00:00:00.000Z",
          validationSchemaId: "strongr.media_validation.v1",
        },
        bytes: new Uint8Array([1, 2, 3]),
        sha256: "a".repeat(64),
      });
    },
    getMediaArtifact() {
      return Promise.reject(new Error("not used"));
    },
    listMediaArtifacts: tenantRead,
    listMediaJobs: tenantRead,
    listMediaOutputSpecs: () => Promise.resolve([]),
    listMediaReviews: tenantRead,
    listStagedReleaseBundles: tenantRead,
    listStagedReleaseRevocations: tenantRead,
  };
}

test("media release actions remain separate governed commands with exact inputs", async () => {
  const calls: BrowserCommandName[] = [];
  const argumentsByCommand = new Map<BrowserCommandName, unknown>();
  const results: Partial<Record<BrowserCommandName, string>> = {
    m2_record_media_review: ids.review,
    m2_request_media: ids.job,
    m2_revoke_staged_release: ids.stagedRevocation,
    m2_stage_release: ids.stagedBundle,
  };
  const commands: StudioCommandGateway = {
    invoke<Name extends BrowserCommandName>(
      command: Name,
      arguments_: BrowserCommandArguments[Name],
    ): Promise<BrowserCommandResult<Name>> {
      calls.push(command);
      argumentsByCommand.set(command, arguments_);
      return Promise.resolve(results[command] as BrowserCommandResult<Name>);
    },
  };
  const flow = new MediaReleaseOperatorFlow({
    commands,
    mediaReads: createMediaReads(),
    reads: createTenantReads(),
  });

  await flow.requestMedia({
    adapterKey: "strongr.synthetic_audio",
    adapterVersion: " 1.0.0 ",
    correlationId: fixtureIds.correlationId,
    idempotencyKey: " m3-3-stable-request ",
    organizationId: fixtureIds.organizationAlphaId,
    outputSpecId: ids.outputSpec,
    productionPackageId: ids.package,
  });
  await flow.recordReview({
    accessibilityStatus: "approved",
    correlationId: fixtureIds.correlationId,
    decision: "approved",
    evidence: { source: "synthetic_test" },
    mediaArtifactId: ids.artifact,
    organizationId: fixtureIds.organizationAlphaId,
    reasonCode: "m3_3_review",
    transcriptStatus: "ready",
  });
  await flow.stageRelease({
    configuration: { release_channel: "private_acceptance" },
    correlationId: fixtureIds.correlationId,
    mediaArtifactId: ids.artifact,
    mediaReviewId: ids.review,
    organizationId: fixtureIds.organizationAlphaId,
    productionPackageId: ids.package,
  });
  await flow.revokeStagedRelease({
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
    reasonCode: "m3_3_withdrawn",
    stagedReleaseBundleId: ids.stagedBundle,
  });

  assert.deepEqual(calls, [
    "m2_request_media",
    "m2_record_media_review",
    "m2_stage_release",
    "m2_revoke_staged_release",
  ]);
  assert.deepEqual(argumentsByCommand.get("m2_request_media"), {
    adapterKey: "strongr.synthetic_audio",
    adapterVersion: "1.0.0",
    correlationId: fixtureIds.correlationId,
    idempotencyKey: "m3-3-stable-request",
    organizationId: fixtureIds.organizationAlphaId,
    outputSpecId: ids.outputSpec,
    productionPackageId: ids.package,
  });
});

test("workspace and verified download stay bound to the selected organization", async () => {
  const observed: string[] = [];
  const flow = new MediaReleaseOperatorFlow({
    commands: {
      invoke() {
        return Promise.reject(new Error("not used"));
      },
    },
    mediaReads: createMediaReads((tenant) => observed.push(tenant)),
    reads: createTenantReads((tenant) => observed.push(tenant)),
  });

  await flow.loadWorkspace(fixtureIds.organizationAlphaId);
  const download = await flow.downloadArtifact(fixtureIds.organizationAlphaId, ids.artifact);

  assert.equal(download.artifact.id, ids.artifact);
  assert.equal(download.bytes.byteLength, 3);
  assert.ok(observed.length >= 8);
  assert.ok(observed.every((tenant) => tenant === fixtureIds.organizationAlphaId));
});

test("invalid media metadata is rejected before a command is invoked", async () => {
  let calls = 0;
  const flow = new MediaReleaseOperatorFlow({
    commands: {
      invoke() {
        calls += 1;
        return Promise.reject(new Error("unexpected command"));
      },
    },
    mediaReads: createMediaReads(),
    reads: createTenantReads(),
  });

  await assert.rejects(
    () =>
      flow.revokeStagedRelease({
        correlationId: fixtureIds.correlationId,
        organizationId: fixtureIds.organizationAlphaId,
        reasonCode: "Contains spaces",
        stagedReleaseBundleId: ids.stagedBundle,
      }),
    /reason code is invalid/,
  );
  assert.equal(calls, 0);
});
