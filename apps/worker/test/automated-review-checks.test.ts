import assert from "node:assert/strict";
import test from "node:test";

import { deterministicGenerationAdapter } from "../../../packages/ai/src/index.ts";
import type {
  CheckDefinitionSummary,
  RecordCheckRunArguments,
  Uuid,
} from "../../../packages/contracts/src/index.ts";
import { createGenerationRequestFixture, fixtureIds } from "../../../packages/testing/src/index.ts";
import {
  AutomatedReviewCheckRunner,
  SupabaseReviewCheckStore,
  SupabaseRpcClient,
} from "../src/index.ts";
import type {
  AutomatedCheckStore,
  AutomatedReviewCheckEvidence,
  WorkerEnvironment,
} from "../src/index.ts";

const contentVersionId = "00000000-0000-4000-8000-000000000040";
const checkRunId = "00000000-0000-4000-8000-000000000041";
const definitionKeys = [
  ["scripture.reference_present", "scripture", true],
  ["scripture.translation_identified", "scripture", true],
  ["pastoral.no_divine_impersonation", "pastoral", true],
  ["pastoral.no_harmful_certainty", "pastoral", true],
  ["editorial.required_structure", "editorial", true],
  ["rights.sources_declared", "rights", true],
  ["accessibility.transcript_ready", "accessibility", true],
  ["narration.brand_pronunciation", "narration", false],
] as const;

const definitions: readonly CheckDefinitionSummary[] = Object.freeze(
  definitionKeys.map(([key, lane, blocksApproval], index) =>
    Object.freeze({
      blocksApproval,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      key,
      lane,
      name: key,
      version: 1,
    }),
  ),
);

test("deterministic worker records all versioned checks as evidence, never approval", async () => {
  const generation = await deterministicGenerationAdapter.generate(
    createGenerationRequestFixture(),
  );
  let recorded: RecordCheckRunArguments | undefined;
  const evidence: AutomatedReviewCheckEvidence[] = [];
  const store: AutomatedCheckStore = {
    recordCheckRun(arguments_) {
      recorded = arguments_;
      return Promise.resolve(checkRunId);
    },
  };
  const runner = new AutomatedReviewCheckRunner({
    evidence: { record: (entry) => evidence.push(entry) },
    store,
  });

  const result = await runner.run({
    checkDefinitions: definitions,
    contentVersionId,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
    reflection: generation.output,
  });

  assert.equal(result.checkRunId, checkRunId);
  assert.equal(result.results.length, 8);
  assert.equal(
    result.results.every((entry) => ["pass", "warn"].includes(entry.outcome)),
    true,
  );
  assert.equal(recorded?.engineKey, "strongr.m1_3.deterministic");
  assert.equal(recorded?.engineVersion, "1.0.0");
  assert.equal(recorded?.status, "completed");
  assert.deepEqual(evidence, [
    {
      blocking_outcome_count: 0,
      check: "m1_3_automated_review_checks",
      check_count: 8,
      check_run_id: checkRunId,
      content_version_id: contentVersionId,
      correlation_id: fixtureIds.correlationId,
      organization_id: fixtureIds.organizationAlphaId,
      status: "pass",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(evidence), /opening|reflection|closing|scripture_references/);
});

test("high-risk deterministic patterns fail closed and remain human-review evidence only", async () => {
  const generation = await deterministicGenerationAdapter.generate(
    createGenerationRequestFixture(),
  );
  const store: AutomatedCheckStore = {
    recordCheckRun() {
      return Promise.resolve(checkRunId);
    },
  };
  const runner = new AutomatedReviewCheckRunner({ store });

  const result = await runner.run({
    checkDefinitions: definitions,
    contentVersionId,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
    reflection: {
      ...generation.output,
      opening: "God told you this is guaranteed to heal.",
    },
  });

  assert.equal(
    result.results.find((entry) => entry.checkDefinitionId === definitions[2]?.id)?.outcome,
    "fail",
  );
  assert.equal(
    result.results.find((entry) => entry.checkDefinitionId === definitions[3]?.id)?.outcome,
    "fail",
  );
});

test("database recording failure emits redacted failure evidence and is not retried", async () => {
  const generation = await deterministicGenerationAdapter.generate(
    createGenerationRequestFixture(),
  );
  let attempts = 0;
  const evidence: AutomatedReviewCheckEvidence[] = [];
  const runner = new AutomatedReviewCheckRunner({
    evidence: { record: (entry) => evidence.push(entry) },
    store: {
      recordCheckRun() {
        attempts += 1;
        return Promise.reject(new Error("private database detail"));
      },
    },
  });

  await assert.rejects(
    () =>
      runner.run({
        checkDefinitions: definitions,
        contentVersionId,
        correlationId: fixtureIds.correlationId,
        organizationId: fixtureIds.organizationAlphaId,
        reflection: generation.output,
      }),
    /recording failed/,
  );
  assert.equal(attempts, 1);
  assert.equal(evidence[0]?.error_code, "database.record_failed");
  assert.doesNotMatch(JSON.stringify(evidence), /private database detail/);
});

test("service-role check store sends the exact existing RPC contract", async () => {
  const environment: WorkerEnvironment = Object.freeze({
    privilegedKeyKind: "secret",
    supabasePrivilegedKey: "sb_secret_check_fixture_123456",
    supabaseUrl: "https://example.supabase.co",
    workerId: "m1-review-check-worker",
  });
  let body: Readonly<Record<string, unknown>> | undefined;
  const rpc = new SupabaseRpcClient(environment, (_input, init) => {
    body = JSON.parse(String(init?.body)) as Readonly<Record<string, unknown>>;
    return Promise.resolve(Response.json(checkRunId));
  });
  const store = new SupabaseReviewCheckStore(rpc);

  const result = await store.recordCheckRun({
    contentVersionId,
    correlationId: fixtureIds.correlationId,
    engineKey: "strongr.m1_3.deterministic",
    engineVersion: "1.0.0",
    organizationId: fixtureIds.organizationAlphaId,
    results: [
      {
        checkDefinitionId: definitions[0]?.id as Uuid,
        detailCode: "m1_3.scripture_reference_present",
        evidence: { reference_count: 1 },
        outcome: "pass",
      },
    ],
    status: "completed",
  });

  assert.equal(result, checkRunId);
  assert.deepEqual(body, {
    p_content_version_id: contentVersionId,
    p_correlation_id: fixtureIds.correlationId,
    p_engine_key: "strongr.m1_3.deterministic",
    p_engine_version: "1.0.0",
    p_organization_id: fixtureIds.organizationAlphaId,
    p_results: [
      {
        check_definition_id: definitions[0]?.id,
        detail_code: "m1_3.scripture_reference_present",
        evidence: { reference_count: 1 },
        outcome: "pass",
      },
    ],
    p_status: "completed",
  });
});
