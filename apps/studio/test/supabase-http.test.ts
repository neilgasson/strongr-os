import assert from "node:assert/strict";
import test from "node:test";

import { createSyntheticPcmWav } from "../../../packages/media/src/index.ts";
import { createStudioSupabaseGateway, StudioApiError } from "../src/index.ts";
import type { StudioEnvironment } from "../src/index.ts";

const organizationId = "00000000-0000-4000-8000-000000000001";
const contentItemId = "00000000-0000-4000-8000-000000000002";
const briefId = "00000000-0000-4000-8000-000000000003";
const jobId = "00000000-0000-4000-8000-000000000004";
const versionId = "00000000-0000-4000-8000-000000000005";
const correlationId = "00000000-0000-4000-8000-000000000006";
const policyId = "00000000-0000-4000-8000-000000000007";
const checkRunId = "00000000-0000-4000-8000-000000000008";
const scriptureEvidenceId = "00000000-0000-4000-8000-000000000009";
const rightsSnapshotId = "00000000-0000-4000-8000-000000000010";
const scriptureReviewId = "00000000-0000-4000-8000-000000000011";
const theologyReviewId = "00000000-0000-4000-8000-000000000012";
const editorialReviewId = "00000000-0000-4000-8000-000000000013";
const approvalId = "00000000-0000-4000-8000-000000000014";
const packageId = "00000000-0000-4000-8000-000000000015";
const outputSpecId = "00000000-0000-4000-8000-000000000016";
const mediaArtifactId = "00000000-0000-4000-8000-000000000017";
const mediaAttemptId = "00000000-0000-4000-8000-000000000018";
const mediaReviewId = "00000000-0000-4000-8000-000000000019";
const stagedReleaseId = "00000000-0000-4000-8000-000000000020";
const stagedRevocationId = "00000000-0000-4000-8000-000000000021";
const hash = "a".repeat(64);
const mediaHash = "2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd";

const environment: StudioEnvironment = Object.freeze({
  supabasePublishableKey: "sb_publishable_fixture_123456",
  supabaseUrl: "https://example.supabase.co",
});

test("authenticated commands use the publishable key, user bearer token, and exact RPC body", async () => {
  const requests: { readonly input: string; readonly init?: RequestInit }[] = [];
  const gateway = createStudioSupabaseGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch(input, init) {
      requests.push({ input: String(input), ...(init ? { init } : {}) });
      return Promise.resolve(
        Response.json([{ brief_id: briefId, content_item_id: contentItemId }]),
      );
    },
  });

  const result = await gateway.invoke("m1_create_audio_brief", {
    correlationId,
    organizationId,
    payload: { schema_id: "strongr.audio_reflection_brief.v1" },
    title: "Synthetic brief",
  });

  assert.deepEqual(result, { briefId, contentItemId });
  assert.equal(requests[0]?.input, "https://example.supabase.co/rest/v1/rpc/m1_create_audio_brief");
  const headers = requests[0]?.init?.headers as Readonly<Record<string, string>>;
  assert.equal(headers.apikey, environment.supabasePublishableKey);
  assert.equal(headers.authorization, "Bearer authenticated-user-jwt");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    p_correlation_id: correlationId,
    p_organization_id: organizationId,
    p_payload: { schema_id: "strongr.audio_reflection_brief.v1" },
    p_title: "Synthetic brief",
  });
});

test("media requests remain an exact AAL2 browser RPC without direct Storage access", async () => {
  const requests: { readonly input: string; readonly init?: RequestInit }[] = [];
  const gateway = createStudioSupabaseGateway({
    accessToken: "fresh-aal2-user-jwt",
    environment,
    fetch(input, init) {
      requests.push({ input: String(input), ...(init ? { init } : {}) });
      return Promise.resolve(Response.json(jobId));
    },
  });

  assert.equal(
    await gateway.invoke("m2_request_media", {
      adapterKey: "strongr.synthetic_audio",
      adapterVersion: "1.0.0",
      correlationId,
      idempotencyKey: "m2-1-synthetic-request",
      organizationId,
      outputSpecId,
      productionPackageId: packageId,
    }),
    jobId,
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.input, "https://example.supabase.co/rest/v1/rpc/m2_request_media");
  const headers = requests[0]?.init?.headers as Readonly<Record<string, string>>;
  assert.equal(headers.apikey, environment.supabasePublishableKey);
  assert.equal(headers.authorization, "Bearer fresh-aal2-user-jwt");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    p_adapter_key: "strongr.synthetic_audio",
    p_adapter_version: "1.0.0",
    p_correlation_id: correlationId,
    p_idempotency_key: "m2-1-synthetic-request",
    p_organization_id: organizationId,
    p_output_spec_id: outputSpecId,
    p_production_package_id: packageId,
  });
});

test("M2.2 human review, staging, and revocation map exact governed RPCs", async () => {
  const requests: { readonly input: string; readonly init?: RequestInit }[] = [];
  const results = [mediaReviewId, stagedReleaseId, stagedRevocationId];
  const gateway = createStudioSupabaseGateway({
    accessToken: "fresh-aal2-user-jwt",
    environment,
    fetch(input, init) {
      requests.push({ input: String(input), ...(init ? { init } : {}) });
      return Promise.resolve(Response.json(results[requests.length - 1]));
    },
  });

  await gateway.invoke("m2_record_media_review", {
    accessibilityStatus: "approved",
    correlationId,
    decision: "approved",
    evidence: { transcript_checksum: hash },
    mediaArtifactId,
    organizationId,
    reasonCode: "human_media_accepted",
    transcriptStatus: "ready",
  });
  await gateway.invoke("m2_stage_release", {
    configuration: { release_channel: "private_acceptance" },
    correlationId,
    mediaArtifactId,
    mediaReviewId,
    organizationId,
    productionPackageId: packageId,
  });
  await gateway.invoke("m2_revoke_staged_release", {
    correlationId,
    organizationId,
    reasonCode: "evidence_changed",
    stagedReleaseBundleId: stagedReleaseId,
  });

  assert.deepEqual(
    requests.map(({ input }) => input),
    [
      "https://example.supabase.co/rest/v1/rpc/m2_record_media_review",
      "https://example.supabase.co/rest/v1/rpc/m2_stage_release",
      "https://example.supabase.co/rest/v1/rpc/m2_revoke_staged_release",
    ],
  );
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    p_accessibility_status: "approved",
    p_correlation_id: correlationId,
    p_decision: "approved",
    p_evidence: { transcript_checksum: hash },
    p_media_artifact_id: mediaArtifactId,
    p_organization_id: organizationId,
    p_reason_code: "human_media_accepted",
    p_transcript_status: "ready",
  });
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    p_configuration: { release_channel: "private_acceptance" },
    p_correlation_id: correlationId,
    p_media_artifact_id: mediaArtifactId,
    p_media_review_id: mediaReviewId,
    p_organization_id: organizationId,
    p_production_package_id: packageId,
  });
  assert.deepEqual(JSON.parse(String(requests[2]?.init?.body)), {
    p_correlation_id: correlationId,
    p_organization_id: organizationId,
    p_reason_code: "evidence_changed",
    p_staged_release_bundle_id: stagedReleaseId,
  });
});

test("exact private media retrieval is tenant-filtered and verifies canonical bytes", async () => {
  const requestedUrls: string[] = [];
  const bytes = createSyntheticPcmWav();
  const objectPath = `${organizationId}/${packageId}/${mediaArtifactId}.wav`;
  const gateway = createStudioSupabaseGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch(input, init) {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("/rest/v1/media_artifacts?")) {
        return Promise.resolve(
          Response.json([
            {
              bits_per_sample: 16,
              bucket_id: "strongr-os-media",
              byte_count: bytes.byteLength,
              channels: 1,
              codec: "pcm_s16le",
              container: "wav",
              created_at: "2026-07-27T03:30:00Z",
              duration_ms: 100,
              id: mediaArtifactId,
              media_job_id: jobId,
              mime_type: "audio/wav",
              object_path: objectPath,
              organization_id: organizationId,
              output_spec_id: outputSpecId,
              production_package_id: packageId,
              sample_rate_hz: 16_000,
              sha256: mediaHash,
              successful_attempt_id: mediaAttemptId,
              validated_at: "2026-07-27T03:30:00Z",
              validation_schema_id: "strongr.media_validation.v1",
            },
          ]),
        );
      }
      const headers = init?.headers as Readonly<Record<string, string>>;
      assert.equal(headers.apikey, environment.supabasePublishableKey);
      assert.equal(headers.authorization, "Bearer authenticated-user-jwt");
      assert.equal(init?.method, "GET");
      return Promise.resolve(
        new Response(Buffer.from(bytes), {
          headers: { "content-type": "audio/wav" },
          status: 200,
        }),
      );
    },
  });

  const download = await gateway.downloadMediaArtifact(organizationId, mediaArtifactId);
  assert.equal(download.artifact.objectPath, objectPath);
  assert.equal(download.sha256, mediaHash);
  assert.deepEqual(download.bytes, bytes);
  const metadataUrl = new URL(requestedUrls[0] ?? "");
  assert.equal(metadataUrl.searchParams.get("organization_id"), `eq.${organizationId}`);
  assert.equal(metadataUrl.searchParams.get("id"), `eq.${mediaArtifactId}`);
  assert.equal(metadataUrl.searchParams.get("limit"), "1");
  assert.equal(
    requestedUrls[1],
    `https://example.supabase.co/storage/v1/object/authenticated/strongr-os-media/${objectPath}`,
  );
  assert.doesNotMatch(requestedUrls.join("\n"), /\/object\/list|\/storage\/v1\/object\/list/);
});

test("M1.3 governed RPCs map exact evidence identities without browser table writes", async () => {
  const requests: { readonly input: string; readonly init?: RequestInit }[] = [];
  const gateway = createStudioSupabaseGateway({
    accessToken: "fresh-aal2-user-jwt",
    environment,
    fetch(input, init) {
      requests.push({ input: String(input), ...(init ? { init } : {}) });
      return Promise.resolve(Response.json(approvalId));
    },
  });

  await gateway.invoke("m1_create_review_policy", {
    correlationId,
    key: "m1_3_default",
    organizationId,
    version: 1,
  });
  await gateway.invoke("m1_record_scripture_evidence", {
    contentVersionId: versionId,
    correlationId,
    organizationId,
    reference: "Synthetic Reference 1:1",
    sourceCitation: "Synthetic source citation",
    translation: "TEST",
    verificationStatus: "verified",
  });
  await gateway.invoke("m1_record_rights_snapshot", {
    contentVersionId: versionId,
    correlationId,
    organizationId,
    sourceSummary: "Synthetic rights evidence",
    status: "cleared",
  });
  await gateway.invoke("m1_record_review", {
    contentVersionId: versionId,
    correlationId,
    decision: "approved",
    evidence: { source: "synthetic_test" },
    lane: "scripture",
    organizationId,
    reasonCode: "m1_3_acceptance",
  });
  await gateway.invoke("m1_approve_version", {
    checkRunId,
    contentVersionId: versionId,
    correlationId,
    editorialReviewId,
    organizationId,
    reasonCode: "m1_3_acceptance",
    reviewPolicyId: policyId,
    rightsSnapshotId,
    scriptureEvidenceId,
    scriptureReviewId,
    theologyReviewId,
  });
  await gateway.invoke("m1_create_production_package", {
    approvalSnapshotId: approvalId,
    correlationId,
    organizationId,
  });
  await gateway.invoke("m1_revoke_approval", {
    approvalSnapshotId: approvalId,
    correlationId,
    organizationId,
    reasonCode: "evidence_changed",
  });

  assert.equal(requests.length, 7);
  assert.deepEqual(JSON.parse(String(requests[4]?.init?.body)), {
    p_check_run_id: checkRunId,
    p_content_version_id: versionId,
    p_correlation_id: correlationId,
    p_editorial_review_id: editorialReviewId,
    p_organization_id: organizationId,
    p_reason_code: "m1_3_acceptance",
    p_review_policy_id: policyId,
    p_rights_snapshot_id: rightsSnapshotId,
    p_scripture_evidence_id: scriptureEvidenceId,
    p_scripture_review_id: scriptureReviewId,
    p_theology_review_id: theologyReviewId,
  });
  assert.deepEqual(JSON.parse(String(requests[5]?.init?.body)), {
    p_approval_snapshot_id: approvalId,
    p_correlation_id: correlationId,
    p_organization_id: organizationId,
  });
  assert.deepEqual(JSON.parse(String(requests[6]?.init?.body)), {
    p_approval_snapshot_id: approvalId,
    p_correlation_id: correlationId,
    p_organization_id: organizationId,
    p_reason_code: "evidence_changed",
  });
  for (const request of requests) {
    const headers = request.init?.headers as Readonly<Record<string, string>>;
    assert.equal(headers.apikey, environment.supabasePublishableKey);
    assert.equal(headers.authorization, "Bearer fresh-aal2-user-jwt");
    assert.equal(request.init?.method, "POST");
  }
});

test("tenant reads are explicitly filtered, bounded, ordered, and contract parsed", async () => {
  const requestedUrls: string[] = [];
  const gateway = createStudioSupabaseGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch(input) {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("/content_briefs?")) {
        return Promise.resolve(
          Response.json([
            {
              content_item_id: contentItemId,
              created_at: "2026-07-26T20:00:00Z",
              id: briefId,
              organization_id: organizationId,
              payload_hash: hash,
              schema_id: "strongr.audio_reflection_brief.v1",
            },
          ]),
        );
      }
      if (url.includes("/generation_jobs?")) {
        return Promise.resolve(
          Response.json([
            {
              attempt_count: 1,
              brief_id: briefId,
              created_at: "2026-07-26T20:01:00Z",
              finished_at: "2026-07-26T20:02:00Z",
              id: jobId,
              organization_id: organizationId,
              output_hash: hash,
              state: "succeeded",
            },
          ]),
        );
      }
      return Promise.resolve(
        Response.json([
          {
            brief_id: briefId,
            content_item_id: contentItemId,
            created_at: "2026-07-26T20:02:00Z",
            id: versionId,
            organization_id: organizationId,
            payload: { schema_id: "strongr.audio_reflection.v1" },
            payload_hash: hash,
            schema_id: "strongr.audio_reflection.v1",
            source: "ai_assisted",
            source_job_id: jobId,
            state: "draft",
            submitted_at: null,
            version_number: 1,
          },
        ]),
      );
    },
  });

  const [briefs, jobs, versions] = await Promise.all([
    gateway.listBriefs(organizationId, 25),
    gateway.listGenerationJobs(organizationId, 25),
    gateway.listContentVersions(organizationId, 25),
  ]);

  assert.equal(briefs[0]?.id, briefId);
  assert.equal(jobs[0]?.state, "succeeded");
  assert.equal(versions[0]?.sourceJobId, jobId);
  for (const requestedUrl of requestedUrls) {
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get("organization_id"), `eq.${organizationId}`);
    assert.equal(url.searchParams.get("limit"), "25");
    assert.equal(url.searchParams.get("order"), "created_at.desc,id.desc");
    assert.equal(url.searchParams.has("offset"), false);
  }
});

test("M1.3 evidence reads remain tenant-filtered and parse immutable hashes", async () => {
  const requestedUrls: string[] = [];
  const gateway = createStudioSupabaseGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch(input) {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("/check_definitions?")) {
        return Promise.resolve(
          Response.json([
            {
              blocks_approval: true,
              id: scriptureReviewId,
              key: "scripture.reference_present",
              lane: "scripture",
              name: "Scripture reference present",
              version: 1,
            },
          ]),
        );
      }
      if (url.includes("/review_policies?")) {
        return Promise.resolve(
          Response.json([
            {
              created_at: "2026-07-26T20:00:00Z",
              id: policyId,
              is_active: true,
              key: "m1_3_default",
              organization_id: organizationId,
              policy_hash: hash,
              version: 1,
            },
          ]),
        );
      }
      if (url.includes("/approval_snapshots?")) {
        return Promise.resolve(
          Response.json([
            {
              approved_at: "2026-07-26T20:01:00Z",
              authentication_assurance: "aal2",
              check_run_id: checkRunId,
              content_version_id: versionId,
              evidence_bundle_hash: hash,
              id: approvalId,
              organization_id: organizationId,
              reason_code: "m1_3_acceptance",
              review_policy_id: policyId,
              rights_snapshot_id: rightsSnapshotId,
              scripture_evidence_id: scriptureEvidenceId,
              version_payload_hash: hash,
            },
          ]),
        );
      }
      return Promise.resolve(
        Response.json([
          {
            approval_snapshot_id: approvalId,
            created_at: "2026-07-26T20:02:00Z",
            id: packageId,
            manifest: {
              approval_snapshot_id: approvalId,
              schema_id: "strongr.production_package.v1",
            },
            manifest_hash: hash,
            manifest_schema_id: "strongr.production_package.v1",
            organization_id: organizationId,
          },
        ]),
      );
    },
  });

  const [definitions, policies, approvals, packages] = await Promise.all([
    gateway.listCheckDefinitions(25),
    gateway.listReviewPolicies(organizationId, 25),
    gateway.listApprovalSnapshots(organizationId, 25),
    gateway.listProductionPackages(organizationId, 25),
  ]);

  assert.equal(definitions[0]?.key, "scripture.reference_present");
  assert.equal(policies[0]?.policyHash, hash);
  assert.equal(approvals[0]?.authenticationAssurance, "aal2");
  assert.equal(packages[0]?.manifestHash, hash);
  const definitionUrl = new URL(
    requestedUrls.find((url) => url.includes("/check_definitions?")) ?? "",
  );
  assert.equal(definitionUrl.searchParams.has("organization_id"), false);
  for (const requestedUrl of requestedUrls.filter((url) => !url.includes("/check_definitions?"))) {
    assert.equal(new URL(requestedUrl).searchParams.get("organization_id"), `eq.${organizationId}`);
  }
});

test("API errors expose only status and machine code and mutating calls are not retried", async () => {
  let attempts = 0;
  const gateway = createStudioSupabaseGateway({
    accessToken: "authenticated-user-jwt",
    environment,
    fetch() {
      attempts += 1;
      return Promise.resolve(
        Response.json(
          {
            code: "42501",
            message: "private database detail that must not reach the operator",
          },
          { status: 403 },
        ),
      );
    },
  });

  await assert.rejects(
    () =>
      gateway.invoke("m1_submit_version", {
        contentVersionId: versionId,
        correlationId,
        organizationId,
      }),
    (error: unknown) => {
      assert.ok(error instanceof StudioApiError);
      assert.equal(error.status, 403);
      assert.equal(error.code, "42501");
      assert.doesNotMatch(error.message, /private database detail/);
      return true;
    },
  );
  assert.equal(attempts, 1);
});

test("service or publishable keys cannot be used as user access tokens", () => {
  const privilegedKey = ["sb", "secret", "must-not-enter-browser"].join("_");
  assert.throws(
    () =>
      createStudioSupabaseGateway({
        accessToken: privilegedKey,
        environment,
      }),
    /authenticated user access token/,
  );
});
