import assert from "node:assert/strict";
import test from "node:test";

import type { StrongrDailyAudioReflectionV2Brief } from "../../../packages/content-schemas/src/index.ts";
import { deterministicGenerationAdapter } from "../../../packages/ai/src/index.ts";
import type {
  BrowserCommandArguments,
  BrowserCommandName,
  BrowserCommandResult,
  TenantReadGateway,
} from "../../../packages/contracts/src/index.ts";
import {
  audioReflectionBriefFixture,
  createGenerationRequestFixture,
  fixtureIds,
} from "../../../packages/testing/src/index.ts";
import { BriefToDraftOperatorFlow, GenerationRequestDeferredError } from "../src/index.ts";
import type { StudioCommandGateway } from "../src/index.ts";

const contentItemId = "00000000-0000-4000-8000-000000000010";
const briefId = "00000000-0000-4000-8000-000000000011";
const versionId = "00000000-0000-4000-8000-000000000012";
const strongrDailyV2BriefFixture: StrongrDailyAudioReflectionV2Brief = {
  audience: "Adults seeking a moment of prayer",
  content_type: "audio_reflection",
  desired_duration_seconds: 300,
  pastoral_purpose: "Encourage stillness before God.",
  prohibited_claims_or_wording: ["Do not promise outcomes."],
  required_elements: ["Prayer", "Personal takeaway"],
  schema_id: "strongr.strongr_daily_audio_reflection_brief.v2",
  scripture_reference: {
    reference: "Psalm 46:10",
    source_citation: "Psalm 46:10",
    translation: "NIV",
  },
  source_brief_identifier: "phase-2-test-psalm-46-10",
  theme: "Be still before God",
  tone: "pastoral",
  working_title: "Be Still",
};

function createReads(): TenantReadGateway {
  return {
    listApprovalRevocations() {
      return Promise.resolve([]);
    },
    listApprovalSnapshots() {
      return Promise.resolve([]);
    },
    listBriefs() {
      return Promise.resolve([]);
    },
    listCheckDefinitions() {
      return Promise.resolve([]);
    },
    listCheckResults() {
      return Promise.resolve([]);
    },
    listCheckRuns() {
      return Promise.resolve([]);
    },
    listContentVersions() {
      return Promise.resolve([]);
    },
    listGenerationJobs() {
      return Promise.resolve([]);
    },
    listProductionPackages() {
      return Promise.resolve([]);
    },
    listReviewDecisions() {
      return Promise.resolve([]);
    },
    listReviewPolicies() {
      return Promise.resolve([]);
    },
    listRightsSnapshots() {
      return Promise.resolve([]);
    },
    listScriptureEvidence() {
      return Promise.resolve([]);
    },
  };
}

test("operator flow validates then creates a brief and requests one durable generation job", async () => {
  const calls: BrowserCommandName[] = [];
  const commands: StudioCommandGateway = {
    invoke<Name extends BrowserCommandName>(
      command: Name,
      _arguments: BrowserCommandArguments[Name],
    ): Promise<BrowserCommandResult<Name>> {
      calls.push(command);
      const result =
        command === "m1_create_audio_brief"
          ? { briefId, contentItemId }
          : fixtureIds.generationJobId;
      return Promise.resolve(result as BrowserCommandResult<Name>);
    },
  };
  const flow = new BriefToDraftOperatorFlow({
    commands,
    reads: createReads(),
  });

  const result = await flow.createBriefAndRequestGeneration({
    brief: audioReflectionBriefFixture,
    correlationId: fixtureIds.correlationId,
    idempotencyKey: "m1.2-test-generation",
    organizationId: fixtureIds.organizationAlphaId,
    promptKey: "strongr.audio_reflection.fixture",
    promptVersion: 1,
    title: "  Synthetic brief  ",
  });

  assert.deepEqual(result, {
    briefId,
    contentItemId,
    generationJobId: fixtureIds.generationJobId,
  });
  assert.deepEqual(calls, ["m1_create_audio_brief", "m1_request_generation"]);
});

test("operator flow accepts the governed Strongr Daily v2 brief contract", async () => {
  const calls: BrowserCommandName[] = [];
  const commands: StudioCommandGateway = {
    invoke<Name extends BrowserCommandName>(
      command: Name,
      _arguments: BrowserCommandArguments[Name],
    ): Promise<BrowserCommandResult<Name>> {
      calls.push(command);
      const result =
        command === "m1_create_audio_brief"
          ? { briefId, contentItemId }
          : fixtureIds.generationJobId;
      return Promise.resolve(result as BrowserCommandResult<Name>);
    },
  };
  const flow = new BriefToDraftOperatorFlow({ commands, reads: createReads() });

  await flow.createBriefAndRequestGeneration({
    brief: strongrDailyV2BriefFixture,
    correlationId: fixtureIds.correlationId,
    idempotencyKey: "phase-2-v2-generation",
    organizationId: fixtureIds.organizationAlphaId,
    promptKey: "strongr.strongr_daily.fixture",
    promptVersion: 1,
    title: strongrDailyV2BriefFixture.working_title,
  });

  assert.deepEqual(calls, ["m1_create_audio_brief", "m1_request_generation"]);
});

test("a post-brief generation failure exposes durable identities for explicit recovery", async () => {
  const commands: StudioCommandGateway = {
    invoke<Name extends BrowserCommandName>(
      command: Name,
      _arguments: BrowserCommandArguments[Name],
    ): Promise<BrowserCommandResult<Name>> {
      if (command === "m1_create_audio_brief") {
        return Promise.resolve({ briefId, contentItemId } as BrowserCommandResult<Name>);
      }
      return Promise.reject(new Error("synthetic request failure"));
    },
  };
  const flow = new BriefToDraftOperatorFlow({
    commands,
    reads: createReads(),
  });

  await assert.rejects(
    () =>
      flow.createBriefAndRequestGeneration({
        brief: audioReflectionBriefFixture,
        correlationId: fixtureIds.correlationId,
        idempotencyKey: "m1.2-test-generation",
        organizationId: fixtureIds.organizationAlphaId,
        promptKey: "strongr.audio_reflection.fixture",
        promptVersion: 1,
        title: "Synthetic brief",
      }),
    (error: unknown) => {
      assert.ok(error instanceof GenerationRequestDeferredError);
      assert.equal(error.briefId, briefId);
      assert.equal(error.contentItemId, contentItemId);
      assert.doesNotMatch(error.message, /synthetic request failure/);
      return true;
    },
  );
});

test("invalid generation metadata is rejected before a brief is created", async () => {
  let commandCalls = 0;
  const commands: StudioCommandGateway = {
    invoke<Name extends BrowserCommandName>(
      _command: Name,
      _arguments: BrowserCommandArguments[Name],
    ): Promise<BrowserCommandResult<Name>> {
      commandCalls += 1;
      return Promise.reject(new Error("unexpected command"));
    },
  };
  const flow = new BriefToDraftOperatorFlow({
    commands,
    reads: createReads(),
  });

  await assert.rejects(
    () =>
      flow.createBriefAndRequestGeneration({
        brief: audioReflectionBriefFixture,
        correlationId: fixtureIds.correlationId,
        idempotencyKey: "short",
        organizationId: fixtureIds.organizationAlphaId,
        promptKey: "strongr.audio_reflection.fixture",
        promptVersion: 1,
        title: "Synthetic brief",
      }),
    /idempotency key is invalid/,
  );
  assert.equal(commandCalls, 0);
});

test("manual drafts and human submission remain explicit governed commands", async () => {
  const calls: BrowserCommandName[] = [];
  const generation = await deterministicGenerationAdapter.generate(
    createGenerationRequestFixture(),
  );
  const commands: StudioCommandGateway = {
    invoke<Name extends BrowserCommandName>(
      command: Name,
      _arguments: BrowserCommandArguments[Name],
    ): Promise<BrowserCommandResult<Name>> {
      calls.push(command);
      const result = command === "m1_create_manual_version" ? versionId : undefined;
      return Promise.resolve(result as BrowserCommandResult<Name>);
    },
  };
  if (generation.output.schema_id !== "strongr.audio_reflection.v1") {
    throw new Error("Expected the v1 fixture output");
  }

  const flow = new BriefToDraftOperatorFlow({
    commands,
    reads: createReads(),
  });

  const createdVersionId = await flow.createManualDraft({
    briefId,
    contentItemId,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
    payload: generation.output,
    supersedesVersionId: null,
  });
  await flow.submitDraft({
    contentVersionId: createdVersionId,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
  });

  assert.equal(createdVersionId, versionId);
  assert.deepEqual(calls, ["m1_create_manual_version", "m1_submit_version"]);
});

test("workspace loading keeps all reads tenant-scoped", async () => {
  const organizations: string[] = [];
  const limits: number[] = [];
  const reads: TenantReadGateway = {
    ...createReads(),
    listBriefs(organizationId, limit) {
      organizations.push(organizationId);
      limits.push(limit ?? 0);
      return Promise.resolve([]);
    },
    listContentVersions(organizationId, limit) {
      organizations.push(organizationId);
      limits.push(limit ?? 0);
      return Promise.resolve([]);
    },
    listGenerationJobs(organizationId, limit) {
      organizations.push(organizationId);
      limits.push(limit ?? 0);
      return Promise.resolve([]);
    },
  };
  const commands: StudioCommandGateway = {
    invoke<Name extends BrowserCommandName>(
      _command: Name,
      _arguments: BrowserCommandArguments[Name],
    ): Promise<BrowserCommandResult<Name>> {
      return Promise.reject(new Error("unexpected command"));
    },
  };
  const flow = new BriefToDraftOperatorFlow({ commands, reads });

  const workspace = await flow.loadWorkspace(fixtureIds.organizationAlphaId, 25);

  assert.deepEqual(workspace, {
    briefs: [],
    generationJobs: [],
    versions: [],
  });
  assert.deepEqual(organizations, Array(3).fill(fixtureIds.organizationAlphaId));
  assert.deepEqual(limits, [25, 25, 25]);
});
