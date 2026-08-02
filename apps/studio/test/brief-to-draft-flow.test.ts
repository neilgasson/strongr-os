import assert from "node:assert/strict";
import test from "node:test";
import { deterministicGenerationAdapter } from "../../../packages/ai/src/index.ts";
import {
  parseAudioReflection,
  type StrongrDailyAudioReflectionV2Brief,
} from "../../../packages/content-schemas/src/index.ts";
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
import type { StudioCommandGateway, StudioGenerationGateway } from "../src/index.ts";
import {
  BriefToDraftOperatorFlow,
  GenerationRequestDeferredError,
  GenerationRuntimeDeferredError,
  StudioApiError,
} from "../src/index.ts";

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

function createGeneration(calls: { generationJobId: string }[] = []): StudioGenerationGateway {
  return {
    startGeneration(input) {
      calls.push(input);
      return Promise.resolve({
        contentVersionId: versionId,
        errorCode: null,
        estimatedCostMicrounits: 2_500,
        generationJobId: input.generationJobId,
        inputTokens: 1_000,
        outputTokens: 2_000,
        state: "succeeded",
      });
    },
  };
}

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
    generation: createGeneration(),
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
  const flow = new BriefToDraftOperatorFlow({
    commands,
    generation: createGeneration(),
    reads: createReads(),
  });

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

test("saving a brief does not request or invoke billable generation", async () => {
  const commands: BrowserCommandName[] = [];
  let runtimeCalls = 0;
  const flow = new BriefToDraftOperatorFlow({
    commands: {
      invoke<Name extends BrowserCommandName>(
        command: Name,
        _arguments: BrowserCommandArguments[Name],
      ): Promise<BrowserCommandResult<Name>> {
        commands.push(command);
        return Promise.resolve({ briefId, contentItemId } as BrowserCommandResult<Name>);
      },
    },
    generation: {
      startGeneration() {
        runtimeCalls += 1;
        return Promise.reject(new Error("generation must remain explicit"));
      },
    },
    reads: createReads(),
  });

  assert.deepEqual(
    await flow.createBrief({
      brief: strongrDailyV2BriefFixture,
      correlationId: fixtureIds.correlationId,
      organizationId: fixtureIds.organizationAlphaId,
      title: strongrDailyV2BriefFixture.working_title,
    }),
    { briefId, contentItemId },
  );
  assert.deepEqual(commands, ["m1_create_audio_brief"]);
  assert.equal(runtimeCalls, 0);
});

test("Phase 4B.5 preparation is a single non-billable RPC and never starts generation", async () => {
  const commands: BrowserCommandName[] = [];
  let runtimeCalls = 0;
  const flow = new BriefToDraftOperatorFlow({
    commands: {
      invoke<Name extends BrowserCommandName>(
        command: Name,
        _arguments: BrowserCommandArguments[Name],
      ): Promise<BrowserCommandResult<Name>> {
        commands.push(command);
        return Promise.resolve({ briefId, contentItemId } as BrowserCommandResult<Name>);
      },
    },
    generation: {
      startGeneration() {
        runtimeCalls += 1;
        return Promise.reject(new Error("Phase 4B.5 preparation must not start generation"));
      },
    },
    reads: createReads(),
  });

  assert.deepEqual(
    await flow.preparePhase4b5GuidedAudioReflectionBrief({
      correlationId: fixtureIds.correlationId,
      organizationId: fixtureIds.organizationAlphaId,
    }),
    { briefId, contentItemId },
  );
  assert.deepEqual(commands, ["m1_prepare_phase4b5_guided_audio_reflection_brief"]);
  assert.equal(runtimeCalls, 0);
});

test("an explicit generation request creates one governed job before invoking the private runtime", async () => {
  const events: unknown[] = [];
  const runtimeCalls: { generationJobId: string }[] = [];
  const flow = new BriefToDraftOperatorFlow({
    commands: {
      invoke<Name extends BrowserCommandName>(
        command: Name,
        arguments_: BrowserCommandArguments[Name],
      ): Promise<BrowserCommandResult<Name>> {
        events.push({ arguments_, command });
        return Promise.resolve(fixtureIds.generationJobId as BrowserCommandResult<Name>);
      },
    },
    generation: {
      startGeneration(input) {
        events.push({ input, runtime: true });
        return createGeneration(runtimeCalls).startGeneration(input);
      },
    },
    reads: createReads(),
  });

  const result = await flow.requestGeneration({
    briefId,
    correlationId: fixtureIds.correlationId,
    idempotencyKey: "phase-4b-owner-click-request",
    organizationId: fixtureIds.organizationAlphaId,
    promptKey: "strongr.strongr_daily.v2",
    promptVersion: 1,
  });

  assert.equal(result.state, "succeeded");
  assert.deepEqual(events, [
    {
      arguments_: {
        briefId,
        correlationId: fixtureIds.correlationId,
        idempotencyKey: "phase-4b-owner-click-request",
        organizationId: fixtureIds.organizationAlphaId,
        promptKey: "strongr.strongr_daily.v2",
        promptVersion: 1,
      },
      command: "m1_request_generation",
    },
    {
      input: {
        generationJobId: fixtureIds.generationJobId,
      },
      runtime: true,
    },
  ]);
  assert.deepEqual(runtimeCalls, [
    {
      generationJobId: fixtureIds.generationJobId,
    },
  ]);
});

test("runtime failures preserve only an allowlisted safe code and redact provider details", async () => {
  const providerSecret = "sk-never-appear-in-owner-errors";
  const flow = new BriefToDraftOperatorFlow({
    commands: {
      invoke<Name extends BrowserCommandName>(): Promise<BrowserCommandResult<Name>> {
        return Promise.resolve(fixtureIds.generationJobId as BrowserCommandResult<Name>);
      },
    },
    generation: {
      startGeneration() {
        const error = new StudioApiError(503, "generation.provider_timeout");
        error.cause = new Error(providerSecret);
        return Promise.reject(error);
      },
    },
    reads: createReads(),
  });

  await assert.rejects(
    () =>
      flow.requestGeneration({
        briefId,
        correlationId: fixtureIds.correlationId,
        idempotencyKey: "phase-4b-owner-click-timeout",
        organizationId: fixtureIds.organizationAlphaId,
        promptKey: "strongr.strongr_daily.v2",
        promptVersion: 1,
      }),
    (error: unknown) => {
      assert.ok(error instanceof GenerationRuntimeDeferredError);
      assert.equal(error.errorCode, "generation.provider_timeout");
      assert.doesNotMatch(error.message, /sk-|provider details|never-appear/);
      return true;
    },
  );
});

test("unknown runtime error codes are not surfaced", async () => {
  const flow = new BriefToDraftOperatorFlow({
    commands: {
      invoke<Name extends BrowserCommandName>(): Promise<BrowserCommandResult<Name>> {
        return Promise.resolve(fixtureIds.generationJobId as BrowserCommandResult<Name>);
      },
    },
    generation: {
      startGeneration() {
        return Promise.reject(new StudioApiError(503, "attacker_controlled_code"));
      },
    },
    reads: createReads(),
  });

  await assert.rejects(
    () =>
      flow.requestGeneration({
        briefId,
        correlationId: fixtureIds.correlationId,
        idempotencyKey: "phase-4b-owner-click-unknown",
        organizationId: fixtureIds.organizationAlphaId,
        promptKey: "strongr.strongr_daily.v2",
        promptVersion: 1,
      }),
    (error: unknown) => {
      assert.ok(error instanceof GenerationRuntimeDeferredError);
      assert.equal(error.errorCode, null);
      return true;
    },
  );
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
  const flow = new BriefToDraftOperatorFlow({
    commands,
    reads: createReads(),
  });

  const createdVersionId = await flow.createManualDraft({
    briefId,
    contentItemId,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
    payload: parseAudioReflection(generation.output),
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
import assert from "node:assert/strict";
import test from "node:test";
import { deterministicGenerationAdapter } from "../../../packages/ai/src/index.ts";
import {
  parseAudioReflection,
  type StrongrDailyAudioReflectionV2Brief,
} from "../../../packages/content-schemas/src/index.ts";
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
import type { StudioCommandGateway, StudioGenerationGateway } from "../src/index.ts";
import {
  BriefToDraftOperatorFlow,
  GenerationRequestDeferredError,
  GenerationRuntimeDeferredError,
  StudioApiError,
} from "../src/index.ts";

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

function createGeneration(calls: { generationJobId: string }[] = []): StudioGenerationGateway {
  return {
    startGeneration(input) {
      calls.push(input);
      return Promise.resolve({
        contentVersionId: versionId,
        errorCode: null,
        estimatedCostMicrounits: 2_500,
        generationJobId: input.generationJobId,
        inputTokens: 1_000,
        outputTokens: 2_000,
        state: "succeeded",
      });
    },
  };
}

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
    generation: createGeneration(),
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
  const flow = new BriefToDraftOperatorFlow({
    commands,
    generation: createGeneration(),
    reads: createReads(),
  });

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

test("saving a brief does not request or invoke billable generation", async () => {
  const commands: BrowserCommandName[] = [];
  let runtimeCalls = 0;
  const flow = new BriefToDraftOperatorFlow({
    commands: {
      invoke<Name extends BrowserCommandName>(
        command: Name,
        _arguments: BrowserCommandArguments[Name],
      ): Promise<BrowserCommandResult<Name>> {
        commands.push(command);
        return Promise.resolve({ briefId, contentItemId } as BrowserCommandResult<Name>);
      },
    },
    generation: {
      startGeneration() {
        runtimeCalls += 1;
        return Promise.reject(new Error("generation must remain explicit"));
      },
    },
    reads: createReads(),
  });

  assert.deepEqual(
    await flow.createBrief({
      brief: strongrDailyV2BriefFixture,
      correlationId: fixtureIds.correlationId,
      organizationId: fixtureIds.organizationAlphaId,
      title: strongrDailyV2BriefFixture.working_title,
    }),
    { briefId, contentItemId },
  );
  assert.deepEqual(commands, ["m1_create_audio_brief"]);
  assert.equal(runtimeCalls, 0);
});

test("an explicit generation request creates one governed job before invoking the private runtime", async () => {
  const events: unknown[] = [];
  const runtimeCalls: { generationJobId: string }[] = [];
  const flow = new BriefToDraftOperatorFlow({
    commands: {
      invoke<Name extends BrowserCommandName>(
        command: Name,
        arguments_: BrowserCommandArguments[Name],
      ): Promise<BrowserCommandResult<Name>> {
        events.push({ arguments_, command });
        return Promise.resolve(fixtureIds.generationJobId as BrowserCommandResult<Name>);
      },
    },
    generation: {
      startGeneration(input) {
        events.push({ input, runtime: true });
        return createGeneration(runtimeCalls).startGeneration(input);
      },
    },
    reads: createReads(),
  });

  const result = await flow.requestGeneration({
    briefId,
    correlationId: fixtureIds.correlationId,
    idempotencyKey: "phase-4b-owner-click-request",
    organizationId: fixtureIds.organizationAlphaId,
    promptKey: "strongr.strongr_daily.v2",
    promptVersion: 1,
  });

  assert.equal(result.state, "succeeded");
  assert.deepEqual(events, [
    {
      arguments_: {
        briefId,
        correlationId: fixtureIds.correlationId,
        idempotencyKey: "phase-4b-owner-click-request",
        organizationId: fixtureIds.organizationAlphaId,
        promptKey: "strongr.strongr_daily.v2",
        promptVersion: 1,
      },
      command: "m1_request_generation",
    },
    {
      input: {
        generationJobId: fixtureIds.generationJobId,
      },
      runtime: true,
    },
  ]);
  assert.deepEqual(runtimeCalls, [
    {
      generationJobId: fixtureIds.generationJobId,
    },
  ]);
});

test("runtime failures preserve only an allowlisted safe code and redact provider details", async () => {
  const providerSecret = "sk-never-appear-in-owner-errors";
  const flow = new BriefToDraftOperatorFlow({
    commands: {
      invoke<Name extends BrowserCommandName>(): Promise<BrowserCommandResult<Name>> {
        return Promise.resolve(fixtureIds.generationJobId as BrowserCommandResult<Name>);
      },
    },
    generation: {
      startGeneration() {
        const error = new StudioApiError(503, "generation.provider_timeout");
        error.cause = new Error(providerSecret);
        return Promise.reject(error);
      },
    },
    reads: createReads(),
  });

  await assert.rejects(
    () =>
      flow.requestGeneration({
        briefId,
        correlationId: fixtureIds.correlationId,
        idempotencyKey: "phase-4b-owner-click-timeout",
        organizationId: fixtureIds.organizationAlphaId,
        promptKey: "strongr.strongr_daily.v2",
        promptVersion: 1,
      }),
    (error: unknown) => {
      assert.ok(error instanceof GenerationRuntimeDeferredError);
      assert.equal(error.errorCode, "generation.provider_timeout");
      assert.doesNotMatch(error.message, /sk-|provider details|never-appear/);
      return true;
    },
  );
});

test("unknown runtime error codes are not surfaced", async () => {
  const flow = new BriefToDraftOperatorFlow({
    commands: {
      invoke<Name extends BrowserCommandName>(): Promise<BrowserCommandResult<Name>> {
        return Promise.resolve(fixtureIds.generationJobId as BrowserCommandResult<Name>);
      },
    },
    generation: {
      startGeneration() {
        return Promise.reject(new StudioApiError(503, "attacker_controlled_code"));
      },
    },
    reads: createReads(),
  });

  await assert.rejects(
    () =>
      flow.requestGeneration({
        briefId,
        correlationId: fixtureIds.correlationId,
        idempotencyKey: "phase-4b-owner-click-unknown",
        organizationId: fixtureIds.organizationAlphaId,
        promptKey: "strongr.strongr_daily.v2",
        promptVersion: 1,
      }),
    (error: unknown) => {
      assert.ok(error instanceof GenerationRuntimeDeferredError);
      assert.equal(error.errorCode, null);
      return true;
    },
  );
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
  const flow = new BriefToDraftOperatorFlow({
    commands,
    reads: createReads(),
  });

  const createdVersionId = await flow.createManualDraft({
    briefId,
    contentItemId,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
    payload: parseAudioReflection(generation.output),
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
