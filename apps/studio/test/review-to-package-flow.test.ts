import assert from "node:assert/strict";
import test from "node:test";

import type {
  BrowserCommandArguments,
  BrowserCommandName,
  BrowserCommandResult,
  TenantReadGateway,
} from "../../../packages/contracts/src/index.ts";
import { fixtureIds } from "../../../packages/testing/src/index.ts";
import { ReviewToPackageOperatorFlow } from "../src/index.ts";
import type { StudioCommandGateway } from "../src/index.ts";

const ids = Object.freeze({
  approval: "00000000-0000-4000-8000-000000000020",
  checkRun: "00000000-0000-4000-8000-000000000021",
  editorialReview: "00000000-0000-4000-8000-000000000022",
  package: "00000000-0000-4000-8000-000000000023",
  policy: "00000000-0000-4000-8000-000000000024",
  revocation: "00000000-0000-4000-8000-000000000025",
  rights: "00000000-0000-4000-8000-000000000026",
  scriptureEvidence: "00000000-0000-4000-8000-000000000027",
  scriptureReview: "00000000-0000-4000-8000-000000000028",
  theologyReview: "00000000-0000-4000-8000-000000000029",
  version: "00000000-0000-4000-8000-000000000030",
});

function createReads(
  observeTenant: (organizationId: string) => void = () => {},
  observeDefinitions: () => void = () => {},
): TenantReadGateway {
  return {
    listApprovalRevocations(organizationId) {
      observeTenant(organizationId);
      return Promise.resolve([]);
    },
    listApprovalSnapshots(organizationId) {
      observeTenant(organizationId);
      return Promise.resolve([]);
    },
    listBriefs() {
      return Promise.resolve([]);
    },
    listCheckDefinitions() {
      observeDefinitions();
      return Promise.resolve([]);
    },
    listCheckResults(organizationId) {
      observeTenant(organizationId);
      return Promise.resolve([]);
    },
    listCheckRuns(organizationId) {
      observeTenant(organizationId);
      return Promise.resolve([]);
    },
    listContentVersions() {
      return Promise.resolve([]);
    },
    listGenerationJobs() {
      return Promise.resolve([]);
    },
    listProductionPackages(organizationId) {
      observeTenant(organizationId);
      return Promise.resolve([]);
    },
    listReviewDecisions(organizationId) {
      observeTenant(organizationId);
      return Promise.resolve([]);
    },
    listReviewPolicies(organizationId) {
      observeTenant(organizationId);
      return Promise.resolve([]);
    },
    listRightsSnapshots(organizationId) {
      observeTenant(organizationId);
      return Promise.resolve([]);
    },
    listScriptureEvidence(organizationId) {
      observeTenant(organizationId);
      return Promise.resolve([]);
    },
  };
}

test("review-to-package actions remain separate governed human commands", async () => {
  const calls: BrowserCommandName[] = [];
  const argumentsByCommand = new Map<BrowserCommandName, unknown>();
  const resultIds: Partial<Record<BrowserCommandName, string>> = {
    m1_approve_version: ids.approval,
    m1_create_production_package: ids.package,
    m1_create_review_policy: ids.policy,
    m1_record_review: ids.scriptureReview,
    m1_record_rights_snapshot: ids.rights,
    m1_record_scripture_evidence: ids.scriptureEvidence,
    m1_revoke_approval: ids.revocation,
  };
  const commands: StudioCommandGateway = {
    invoke<Name extends BrowserCommandName>(
      command: Name,
      arguments_: BrowserCommandArguments[Name],
    ): Promise<BrowserCommandResult<Name>> {
      calls.push(command);
      argumentsByCommand.set(command, arguments_);
      return Promise.resolve(resultIds[command] as BrowserCommandResult<Name>);
    },
  };
  const flow = new ReviewToPackageOperatorFlow({ commands, reads: createReads() });

  await flow.activateReviewPolicy({
    correlationId: fixtureIds.correlationId,
    key: "m1_3_default",
    organizationId: fixtureIds.organizationAlphaId,
    version: 1,
  });
  await flow.recordScriptureEvidence({
    contentVersionId: ids.version,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
    reference: "  Synthetic Reference 1:1  ",
    sourceCitation: "  Synthetic source citation  ",
    translation: "  TEST  ",
    verificationStatus: "verified",
  });
  await flow.recordRightsSnapshot({
    contentVersionId: ids.version,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
    sourceSummary: "  Synthetic rights source summary  ",
    status: "cleared",
  });
  await flow.recordReview({
    contentVersionId: ids.version,
    correlationId: fixtureIds.correlationId,
    decision: "approved",
    evidence: { source: "synthetic_test" },
    lane: "scripture",
    organizationId: fixtureIds.organizationAlphaId,
    reasonCode: "m1_3_acceptance",
  });
  await flow.approveVersion({
    checkRunId: ids.checkRun,
    contentVersionId: ids.version,
    correlationId: fixtureIds.correlationId,
    editorialReviewId: ids.editorialReview,
    organizationId: fixtureIds.organizationAlphaId,
    reasonCode: "m1_3_acceptance",
    reviewPolicyId: ids.policy,
    rightsSnapshotId: ids.rights,
    scriptureEvidenceId: ids.scriptureEvidence,
    scriptureReviewId: ids.scriptureReview,
    theologyReviewId: ids.theologyReview,
  });
  await flow.createProductionPackage({
    approvalSnapshotId: ids.approval,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
  });
  await flow.revokeApproval({
    approvalSnapshotId: ids.approval,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
    reasonCode: "evidence_changed",
  });

  assert.deepEqual(calls, [
    "m1_create_review_policy",
    "m1_record_scripture_evidence",
    "m1_record_rights_snapshot",
    "m1_record_review",
    "m1_approve_version",
    "m1_create_production_package",
    "m1_revoke_approval",
  ]);
  assert.deepEqual(argumentsByCommand.get("m1_record_scripture_evidence"), {
    contentVersionId: ids.version,
    correlationId: fixtureIds.correlationId,
    organizationId: fixtureIds.organizationAlphaId,
    reference: "Synthetic Reference 1:1",
    sourceCitation: "Synthetic source citation",
    translation: "TEST",
    verificationStatus: "verified",
  });
});

test("invalid governed metadata is rejected before any command", async () => {
  let calls = 0;
  const commands: StudioCommandGateway = {
    invoke<Name extends BrowserCommandName>(
      _command: Name,
      _arguments: BrowserCommandArguments[Name],
    ): Promise<BrowserCommandResult<Name>> {
      calls += 1;
      return Promise.reject(new Error("unexpected command"));
    },
  };
  const flow = new ReviewToPackageOperatorFlow({ commands, reads: createReads() });

  await assert.rejects(
    () =>
      flow.recordReview({
        contentVersionId: ids.version,
        correlationId: fixtureIds.correlationId,
        decision: "approved",
        evidence: {},
        lane: "scripture",
        organizationId: fixtureIds.organizationAlphaId,
        reasonCode: "Contains spaces",
      }),
    /reason code is invalid/,
  );
  assert.equal(calls, 0);
});

test("review workspace reads are bounded to the selected tenant", async () => {
  const tenants: string[] = [];
  let definitionReads = 0;
  const commands: StudioCommandGateway = {
    invoke<Name extends BrowserCommandName>(
      _command: Name,
      _arguments: BrowserCommandArguments[Name],
    ): Promise<BrowserCommandResult<Name>> {
      return Promise.reject(new Error("unexpected command"));
    },
  };
  const flow = new ReviewToPackageOperatorFlow({
    commands,
    reads: createReads(
      (organizationId) => tenants.push(organizationId),
      () => {
        definitionReads += 1;
      },
    ),
  });

  const workspace = await flow.loadWorkspace(fixtureIds.organizationAlphaId, 25);

  assert.equal(definitionReads, 1);
  assert.deepEqual(tenants, Array(9).fill(fixtureIds.organizationAlphaId));
  assert.deepEqual(workspace, {
    approvalRevocations: [],
    approvalSnapshots: [],
    checkDefinitions: [],
    checkResults: [],
    checkRuns: [],
    productionPackages: [],
    reviewDecisions: [],
    reviewPolicies: [],
    rightsSnapshots: [],
    scriptureEvidence: [],
  });
});
