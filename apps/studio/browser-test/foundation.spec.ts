import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createSyntheticPcmWav } from "../../../packages/media/src/index.ts";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const distRoot = resolve(repositoryRoot, "apps/studio/dist");
const evidenceRoot = resolve(
  repositoryRoot,
  process.env.STRONGR_OS_M3_ARTIFACT_DIR ?? "artifacts/m3-browser",
);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);
const security = JSON.parse(
  await readFile(resolve(repositoryRoot, "apps/studio/preview-security.json"), "utf8"),
) as {
  readonly required_headers: Readonly<Record<string, string>>;
};
const securityHeaders = Object.fromEntries(
  Object.entries(security.required_headers).map(([name, value]) => [
    name,
    value.replace(`\${PUBLIC_SUPABASE_ORIGIN}`, "https://example.supabase.co"),
  ]),
);

const userId = "00000000-0000-4000-8000-000000000001";
const membershipA = "00000000-0000-4000-8000-000000000002";
const membershipB = "00000000-0000-4000-8000-000000000003";
const organizationA = "00000000-0000-4000-8000-000000000010";
const organizationB = "00000000-0000-4000-8000-000000000020";
const factorId = "00000000-0000-4000-8000-000000000030";
const contentItemId = "00000000-0000-4000-8000-000000000101";
const briefId = "00000000-0000-4000-8000-000000000201";
const contentVersionId = "00000000-0000-4000-8000-000000000301";
const checkDefinitionId = "00000000-0000-4000-8000-000000000401";
const checkRunId = "00000000-0000-4000-8000-000000000402";
const checkResultId = "00000000-0000-4000-8000-000000000403";
const scriptureEvidenceId = "00000000-0000-4000-8000-000000000501";
const rightsSnapshotId = "00000000-0000-4000-8000-000000000502";
const reviewPolicyId = "00000000-0000-4000-8000-000000000503";
const scriptureReviewId = "00000000-0000-4000-8000-000000000504";
const theologyReviewId = "00000000-0000-4000-8000-000000000505";
const editorialReviewId = "00000000-0000-4000-8000-000000000506";
const approvalSnapshotId = "00000000-0000-4000-8000-000000000601";
const productionPackageId = "00000000-0000-4000-8000-000000000602";
const approvalRevocationId = "00000000-0000-4000-8000-000000000603";
const mediaOutputSpecId = "00000000-0000-4000-8000-000000000801";
const mediaJobId = "00000000-0000-4000-8000-000000000802";
const mediaAttemptId = "00000000-0000-4000-8000-000000000803";
const mediaArtifactId = "00000000-0000-4000-8000-000000000804";
const mediaReviewId = "00000000-0000-4000-8000-000000000805";
const stagedReleaseId = "00000000-0000-4000-8000-000000000806";
const stagedRevocationId = "00000000-0000-4000-8000-000000000807";
const mediaBytes = createSyntheticPcmWav();
const mediaSha256 = createHash("sha256").update(mediaBytes).digest("hex");
const nowSeconds = Math.floor(Date.now() / 1000);

interface MockState {
  aal: "aal1" | "aal2";
  approvalRevoked: boolean;
  expired: boolean;
  factorPresent: boolean;
  mediaReady: boolean;
  mediaReviewed: boolean;
  packageCreated: boolean;
  releaseRevoked: boolean;
  releaseStaged: boolean;
  readonly rpcCalls: Array<Readonly<{ body: Readonly<Record<string, unknown>>; command: string }>>;
  readonly storageRequests: string[];
  readonly tenantReads: string[];
}

function createJwt(aal: "aal1" | "aal2"): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aal,
    exp: nowSeconds + 3600,
    role: "authenticated",
    sub: userId,
  })}.${Buffer.from("synthetic-signature").toString("base64url")}`;
}

function authUser(state: MockState) {
  return {
    app_metadata: { provider: "email", providers: ["email"] },
    aud: "authenticated",
    created_at: "2026-07-27T00:00:00.000Z",
    email: "operator@example.test",
    factors: state.factorPresent
      ? [
          {
            created_at: "2026-07-27T00:00:00.000Z",
            factor_type: "totp",
            friendly_name: "Acceptance authenticator",
            id: factorId,
            status: "verified",
            updated_at: "2026-07-27T00:00:00.000Z",
          },
        ]
      : [],
    id: userId,
    role: "authenticated",
    updated_at: "2026-07-27T00:00:00.000Z",
    user_metadata: {},
  };
}

function authSession(aal: "aal1" | "aal2", state: MockState) {
  return {
    access_token: createJwt(aal),
    expires_at: nowSeconds + 3600,
    expires_in: 3600,
    refresh_token: "synthetic-browser-refresh",
    token_type: "bearer",
    user: authUser(state),
  };
}

function organizationFilter(url: URL): string | null {
  return url.searchParams.get("organization_id")?.replace(/^eq\./, "") ?? null;
}

function briefRows(organizationId: string | null) {
  const count = organizationId === organizationA ? 1 : organizationId === organizationB ? 2 : 0;
  return Array.from({ length: count }, (_, index) => ({
    content_item_id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
    created_at: `2026-07-27T00:0${index}:00.000Z`,
    id: `00000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`,
    organization_id: organizationId,
    payload_hash: "a".repeat(64),
    schema_id: "strongr.audio_reflection_brief.v1",
  }));
}

function governedRows(
  pathname: string,
  organizationId: string | null,
  state: MockState,
): unknown[] {
  if (pathname === "/rest/v1/content_briefs") {
    return briefRows(organizationId);
  }
  if (
    organizationId !== organizationA &&
    pathname !== "/rest/v1/check_definitions" &&
    pathname !== "/rest/v1/media_output_specs"
  ) {
    return [];
  }
  const createdAt = "2026-07-27T00:10:00.000Z";
  const hash = (character: string) => character.repeat(64);
  switch (pathname) {
    case "/rest/v1/generation_jobs":
      return [];
    case "/rest/v1/content_versions":
      return [
        {
          brief_id: briefId,
          content_item_id: contentItemId,
          created_at: createdAt,
          id: contentVersionId,
          organization_id: organizationA,
          payload: {
            closing: "A synthetic closing for browser acceptance.",
            opening: "A synthetic opening for browser acceptance.",
            reflection: "A synthetic reflection that is never production content.",
            reflection_questions: ["What did this deterministic fixture demonstrate?"],
            schema_id: "strongr.audio_reflection.v1",
            scripture_references: [
              {
                reference: "Synthetic Reference 1:1",
                source_citation: "Synthetic fixture; not a Scripture quotation",
                translation: "TEST",
              },
            ],
            title: "Synthetic Governed Reflection",
          },
          payload_hash: hash("b"),
          schema_id: "strongr.audio_reflection.v1",
          source: "ai_assisted",
          source_job_id: null,
          state: "submitted",
          submitted_at: createdAt,
          version_number: 1,
        },
      ];
    case "/rest/v1/check_definitions":
      return [
        {
          blocks_approval: true,
          id: checkDefinitionId,
          key: "synthetic.schema",
          lane: "editorial",
          name: "Synthetic schema check",
          version: 1,
        },
      ];
    case "/rest/v1/check_runs":
      return [
        {
          artifact_hash: hash("c"),
          content_version_id: contentVersionId,
          correlation_id: "00000000-0000-4000-8000-000000000404",
          created_at: createdAt,
          engine_key: "synthetic.checks",
          engine_version: "1.0.0",
          id: checkRunId,
          organization_id: organizationA,
          status: "completed",
        },
      ];
    case "/rest/v1/check_results":
      return [
        {
          check_definition_id: checkDefinitionId,
          check_run_id: checkRunId,
          created_at: createdAt,
          detail_code: "synthetic_pass",
          evidence: { fixture: true },
          id: checkResultId,
          organization_id: organizationA,
          outcome: "pass",
        },
      ];
    case "/rest/v1/scripture_evidence":
      return [
        {
          content_version_id: contentVersionId,
          created_at: createdAt,
          evidence_hash: hash("d"),
          id: scriptureEvidenceId,
          organization_id: organizationA,
          reference: "Synthetic Reference 1:1",
          source_citation: "Synthetic fixture; not a Scripture quotation",
          translation: "TEST",
          verification_status: "verified",
        },
      ];
    case "/rest/v1/rights_snapshots":
      return [
        {
          content_version_id: contentVersionId,
          created_at: createdAt,
          id: rightsSnapshotId,
          organization_id: organizationA,
          snapshot_hash: hash("e"),
          source_summary: "Synthetic acceptance material",
          status: "cleared",
        },
      ];
    case "/rest/v1/review_policies":
      return [
        {
          created_at: createdAt,
          id: reviewPolicyId,
          is_active: true,
          key: "synthetic_acceptance",
          organization_id: organizationA,
          policy_hash: hash("f"),
          version: 1,
        },
      ];
    case "/rest/v1/review_decisions":
      return [
        [scriptureReviewId, "scripture"],
        [theologyReviewId, "theology"],
        [editorialReviewId, "editorial"],
      ].map(([id, lane]) => ({
        content_version_id: contentVersionId,
        created_at: createdAt,
        decision: "approved",
        evidence: { fixture: true },
        id,
        lane,
        organization_id: organizationA,
        reason_code: "synthetic_acceptance",
      }));
    case "/rest/v1/approval_snapshots":
      return [
        {
          approved_at: createdAt,
          authentication_assurance: "aal2",
          check_run_id: checkRunId,
          content_version_id: contentVersionId,
          evidence_bundle_hash: hash("1"),
          id: approvalSnapshotId,
          organization_id: organizationA,
          reason_code: "synthetic_acceptance",
          review_policy_id: reviewPolicyId,
          rights_snapshot_id: rightsSnapshotId,
          scripture_evidence_id: scriptureEvidenceId,
          version_payload_hash: hash("b"),
        },
      ];
    case "/rest/v1/approval_revocations":
      return state.approvalRevoked
        ? [
            {
              approval_snapshot_id: approvalSnapshotId,
              id: approvalRevocationId,
              organization_id: organizationA,
              reason_code: "evidence_changed",
              revoked_at: "2026-07-27T00:20:00.000Z",
            },
          ]
        : [];
    case "/rest/v1/production_packages":
      return state.packageCreated
        ? [
            {
              approval_snapshot_id: approvalSnapshotId,
              created_at: "2026-07-27T00:15:00.000Z",
              id: productionPackageId,
              manifest: { fixture: true },
              manifest_hash: hash("2"),
              manifest_schema_id: "strongr.production_package.v1",
              organization_id: organizationA,
            },
          ]
        : [];
    case "/rest/v1/media_output_specs":
      return [
        {
          bits_per_sample: 16,
          channels: 1,
          codec: "pcm_s16le",
          container: "wav",
          created_at: createdAt,
          id: mediaOutputSpecId,
          key: "strongr.synthetic_audio",
          max_bytes: 26_214_400,
          max_duration_ms: 900_000,
          media_kind: "audio",
          mime_type: "audio/wav",
          sample_rate_hz: 16_000,
          spec_hash: hash("3"),
          version: 1,
        },
      ];
    case "/rest/v1/media_jobs":
      return state.mediaReady
        ? [
            {
              adapter_key: "strongr.synthetic_audio",
              adapter_version: "1.0.0",
              attempt_count: 1,
              available_at: createdAt,
              correlation_id: checkRunId,
              created_at: createdAt,
              finished_at: createdAt,
              id: mediaJobId,
              input_hash: hash("4"),
              last_error_code: null,
              max_attempts: 3,
              organization_id: organizationA,
              output_spec_id: mediaOutputSpecId,
              production_package_id: productionPackageId,
              request_schema_id: "strongr.media_request.v1",
              requested_by_membership_id: membershipA,
              started_at: createdAt,
              state: "succeeded",
            },
          ]
        : [];
    case "/rest/v1/media_artifacts":
      return state.mediaReady
        ? [
            {
              bits_per_sample: 16,
              bucket_id: "strongr-os-media",
              byte_count: mediaBytes.byteLength,
              channels: 1,
              codec: "pcm_s16le",
              container: "wav",
              created_at: createdAt,
              duration_ms: 1_000,
              id: mediaArtifactId,
              media_job_id: mediaJobId,
              mime_type: "audio/wav",
              object_path: `${organizationA}/${productionPackageId}/${mediaArtifactId}.wav`,
              organization_id: organizationA,
              output_spec_id: mediaOutputSpecId,
              production_package_id: productionPackageId,
              sample_rate_hz: 16_000,
              sha256: mediaSha256,
              successful_attempt_id: mediaAttemptId,
              validated_at: createdAt,
              validation_schema_id: "strongr.media_validation.v1",
            },
          ]
        : [];
    case "/rest/v1/media_reviews":
      return state.mediaReviewed
        ? [
            {
              accessibility_status: "approved",
              created_at: createdAt,
              decision: "approved",
              evidence: { fixture: true },
              evidence_hash: hash("5"),
              id: mediaReviewId,
              media_artifact_id: mediaArtifactId,
              organization_id: organizationA,
              reason_code: "m3_3_operator_media_review",
              reviewer_membership_id: membershipA,
              transcript_status: "ready",
            },
          ]
        : [];
    case "/rest/v1/staged_release_bundles":
      return state.releaseStaged
        ? [
            {
              authentication_assurance: "aal2",
              id: stagedReleaseId,
              manifest: { fixture: true },
              manifest_hash: hash("6"),
              manifest_schema_id: "strongr.staged_release_bundle.v1",
              media_artifact_id: mediaArtifactId,
              media_review_id: mediaReviewId,
              organization_id: organizationA,
              production_package_id: productionPackageId,
              staged_at: createdAt,
              staged_by_membership_id: membershipA,
            },
          ]
        : [];
    case "/rest/v1/staged_release_revocations":
      return state.releaseRevoked
        ? [
            {
              authentication_assurance: "aal2",
              id: stagedRevocationId,
              organization_id: organizationA,
              reason_code: "m3_3_release_withdrawn",
              revoked_at: createdAt,
              revoked_by_membership_id: membershipA,
              staged_release_bundle_id: stagedReleaseId,
            },
          ]
        : [];
    default:
      return [];
  }
}

async function installMockSupabase(page: Page): Promise<MockState> {
  const state: MockState = {
    aal: "aal1",
    approvalRevoked: false,
    expired: false,
    factorPresent: true,
    mediaReady: false,
    mediaReviewed: false,
    packageCreated: false,
    releaseRevoked: false,
    releaseStaged: false,
    rpcCalls: [],
    storageRequests: [],
    tenantReads: [],
  };
  await page.route("https://example.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (
      url.pathname ===
      `/storage/v1/object/authenticated/strongr-os-media/${organizationA}/${productionPackageId}/${mediaArtifactId}.wav`
    ) {
      state.storageRequests.push(url.pathname);
      await route.fulfill({
        body: Buffer.from(mediaBytes),
        contentType: "audio/wav",
        headers: { "cache-control": "no-store" },
        status: 200,
      });
      return;
    }

    if (url.pathname === "/auth/v1/token") {
      await route.fulfill({ json: authSession(state.aal, state), status: 200 });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      await route.fulfill({ json: authUser(state), status: 200 });
      return;
    }
    if (url.pathname === "/auth/v1/logout") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (url.pathname === "/auth/v1/factors" && request.method() === "POST") {
      await route.fulfill({
        json: {
          friendly_name: "Acceptance authenticator",
          id: factorId,
          totp: {
            qr_code:
              '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="white"/><rect x="20" y="20" width="80" height="80" fill="black"/></svg>',
            secret: "SYNTHETICM3ACCEPTANCE",
            uri: "otpauth://totp/Synthetic",
          },
          type: "totp",
        },
        status: 200,
      });
      return;
    }
    if (url.pathname === `/auth/v1/factors/${factorId}` && request.method() === "DELETE") {
      state.factorPresent = false;
      await route.fulfill({ json: { id: factorId }, status: 200 });
      return;
    }
    if (url.pathname === `/auth/v1/factors/${factorId}/challenge`) {
      await route.fulfill({
        json: {
          expires_at: nowSeconds + 300,
          id: "00000000-0000-4000-8000-000000000031",
          type: "totp",
        },
        status: 200,
      });
      return;
    }
    if (url.pathname === `/auth/v1/factors/${factorId}/verify`) {
      state.aal = "aal2";
      state.factorPresent = true;
      await route.fulfill({ json: authSession("aal2", state), status: 200 });
      return;
    }

    if (state.expired && url.pathname.startsWith("/rest/v1/")) {
      await route.fulfill({ json: { code: "PGRST301" }, status: 401 });
      return;
    }
    if (url.pathname === "/rest/v1/profiles") {
      await route.fulfill({
        json: [
          {
            display_name: "Synthetic Operator",
            id: userId,
            preferred_name: "Operator",
            status: "active",
          },
        ],
        status: 200,
      });
      return;
    }
    if (url.pathname === "/rest/v1/memberships") {
      await route.fulfill({
        json: [
          {
            id: membershipA,
            organization_id: organizationA,
            profile_id: userId,
            status: "active",
          },
          {
            id: membershipB,
            organization_id: organizationB,
            profile_id: userId,
            status: "active",
          },
        ],
        status: 200,
      });
      return;
    }
    if (url.pathname === "/rest/v1/organizations") {
      await route.fulfill({
        json: [
          {
            id: organizationA,
            name: "Synthetic North",
            slug: "synthetic-north",
            status: "active",
          },
          {
            id: organizationB,
            name: "Synthetic South",
            slug: "synthetic-south",
            status: "active",
          },
        ],
        status: 200,
      });
      return;
    }
    if (url.pathname === "/rest/v1/rpc/has_permission") {
      const body = request.postDataJSON() as { readonly p_permission_key?: string };
      await route.fulfill({ json: Boolean(body.p_permission_key), status: 200 });
      return;
    }
    if (url.pathname.startsWith("/rest/v1/rpc/") && request.method() === "POST") {
      const command = url.pathname.slice("/rest/v1/rpc/".length);
      const body = request.postDataJSON() as Readonly<Record<string, unknown>>;
      state.rpcCalls.push({ body, command });
      if (command === "m1_create_audio_brief") {
        await route.fulfill({
          json: [{ brief_id: briefId, content_item_id: contentItemId }],
          status: 200,
        });
        return;
      }
      if (command === "m1_submit_version") {
        await route.fulfill({ json: null, status: 200 });
        return;
      }
      if (command === "m1_create_production_package") {
        state.packageCreated = true;
        await route.fulfill({ json: productionPackageId, status: 200 });
        return;
      }
      if (command === "m1_revoke_approval") {
        state.approvalRevoked = true;
        await route.fulfill({ json: approvalRevocationId, status: 200 });
        return;
      }
      if (command === "m2_request_media") {
        state.mediaReady = true;
        await route.fulfill({ json: mediaJobId, status: 200 });
        return;
      }
      if (command === "m2_record_media_review") {
        state.mediaReviewed = true;
        await route.fulfill({ json: mediaReviewId, status: 200 });
        return;
      }
      if (command === "m2_stage_release") {
        state.releaseStaged = true;
        await route.fulfill({ json: stagedReleaseId, status: 200 });
        return;
      }
      if (command === "m2_revoke_staged_release") {
        state.releaseRevoked = true;
        await route.fulfill({ json: stagedRevocationId, status: 200 });
        return;
      }
      const syntheticResult =
        command === "m1_request_generation"
          ? "00000000-0000-4000-8000-000000000701"
          : command === "m1_approve_version"
            ? approvalSnapshotId
            : "00000000-0000-4000-8000-000000000702";
      await route.fulfill({ json: syntheticResult, status: 200 });
      return;
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      const organizationId = organizationFilter(url);
      if (organizationId) {
        state.tenantReads.push(organizationId);
      }
      await route.fulfill({
        json: governedRows(url.pathname, organizationId, state),
        status: 200,
      });
      return;
    }
    await route.fulfill({ json: { code: "not_found" }, status: 404 });
  });
  return state;
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("operator@example.test");
  await page.getByLabel("Password").fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Signed in", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Active organization" })).toBeVisible();
}

test.beforeAll(async () => {
  await mkdir(evidenceRoot, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await page.route("https://strongr.test/**", async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const requestedPath = resolve(distRoot, pathname.slice(1));
    if (requestedPath !== distRoot && !requestedPath.startsWith(`${distRoot}${sep}`)) {
      await route.fulfill({ status: 400 });
      return;
    }

    let path = requestedPath;
    let body = await readFile(path).catch(() => undefined);
    if (!body) {
      path = resolve(distRoot, "index.html");
      body = await readFile(path);
    }
    await route.fulfill({
      body,
      contentType: contentTypes.get(extname(path)) ?? "application/octet-stream",
      headers: securityHeaders,
      status: 200,
    });
  });
});

test("signed-out shell is honest and keyboard operable", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  let assertionFailure: unknown;
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.name));
  await installMockSupabase(page);

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Governed work, clearly in view.",
    );
    await expect(page.getByText("Not signed in", { exact: true })).toBeVisible();
    await expect(page.getByText("Not selected", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Work queue" })).toHaveCount(0);

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  } catch (error) {
    assertionFailure = error;
  }

  await writeFile(
    resolve(evidenceRoot, `browser-console-${testInfo.project.name}.json`),
    `${JSON.stringify(
      {
        errors: browserErrors,
        status: browserErrors.length === 0 && !assertionFailure ? "pass" : "fail",
      },
      null,
      2,
    )}\n`,
  );
  if (assertionFailure) {
    throw assertionFailure;
  }
  expect(browserErrors).toEqual([]);
});

test("sign-in discovers only active memberships and keeps canonical tenant reads explicit", async ({
  page,
}, testInfo) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  const selector = page.getByRole("combobox", { name: "Active organization" });
  await expect(selector.locator("option")).toHaveText([
    "Choose an organization",
    "Synthetic North",
    "Synthetic South",
  ]);
  await selector.selectOption(organizationA);
  await page.getByRole("link", { exact: true, name: "Work queue" }).click();
  await expect(page.getByText("Work queue · Synthetic North")).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "Briefs" })).toContainText("1");

  await selector.selectOption(organizationB);
  await expect(page.getByText("Work queue · Synthetic South")).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "Briefs" })).toContainText("2");
  expect(new Set(state.tenantReads)).toEqual(new Set([organizationA, organizationB]));

  await writeFile(
    resolve(evidenceRoot, `tenant-continuity-${testInfo.project.name}.json`),
    `${JSON.stringify(
      {
        active_organizations: [organizationA, organizationB],
        arbitrary_tenant_observed: false,
        status: "pass",
        tenant_read_count: state.tenantReads.length,
      },
      null,
      2,
    )}\n`,
  );
});

test("expired tenant reads clear the local session and return safely to sign-in", async ({
  page,
}) => {
  const state = await installMockSupabase(page);
  await signIn(page);
  await page.getByRole("combobox", { name: "Active organization" }).selectOption(organizationA);
  await page.getByRole("link", { exact: true, name: "Work queue" }).click();
  await expect(page.getByText("Work queue · Synthetic North")).toBeVisible();

  state.expired = true;
  await page.getByRole("button", { name: "Refresh canonical status" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in to Strongr Studio" })).toBeVisible();
  await expect(page.getByText(/session expired/i)).toBeVisible();
});

test("verified TOTP can step the current session from AAL1 to AAL2", async ({ page }) => {
  await installMockSupabase(page);
  await signIn(page);
  await page.getByRole("link", { name: "Security" }).click();
  await expect(page.getByText("AAL1", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Acceptance authenticator" })).toBeVisible();
  await page.getByLabel("Six-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Step up session" }).click();
  await expect(page.getByText("AAL2", { exact: true })).toBeVisible();
  await expect(page.getByText(/session assurance was refreshed/i)).toBeVisible();
});

test("TOTP enrollment and confirmed unenrollment use supported Auth operations", async ({
  page,
}) => {
  const state = await installMockSupabase(page);
  state.factorPresent = false;
  await signIn(page);
  await page.getByRole("link", { name: "Security" }).click();
  await expect(page.getByText("No TOTP authenticators are enrolled.")).toBeVisible();

  await page.getByRole("button", { name: "Begin TOTP enrollment" }).click();
  await expect(page.getByRole("heading", { name: "Scan and verify" })).toBeVisible();
  await expect(page.getByAltText("One-time TOTP enrollment QR code")).toBeVisible();
  await page.getByLabel("Six-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Finish enrollment" }).click();

  await expect(page.getByRole("heading", { name: "Acceptance authenticator" })).toBeVisible();
  await page.getByLabel("Confirm removal of Acceptance authenticator").check();
  await page.getByRole("button", { name: "Remove authenticator" }).click();
  await expect(page.getByText("No TOTP authenticators are enrolled.")).toBeVisible();
  await expect(
    page.getByText(/Authenticator removed and session assurance refreshed/i),
  ).toBeVisible();
});

test("sign-out clears the browser session without exposing a governed route", async ({ page }) => {
  await installMockSupabase(page);
  await signIn(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Not signed in", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Work queue" })).toHaveCount(0);
  await page.goto("/security");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a brief request keeps one stable idempotency key across its two durable commands", async ({
  page,
}) => {
  const state = await installMockSupabase(page);
  await signIn(page);
  await page.getByRole("combobox", { name: "Active organization" }).selectOption(organizationA);
  await page.getByRole("link", { name: "Governed content" }).click();
  await expect(
    page.getByRole("heading", { name: "Brief through immutable package." }),
  ).toBeVisible();

  const requestButton = page.getByRole("button", {
    name: "Create brief and request generation",
  });
  await requestButton.click();
  await expect(page.getByText(/Brief created and generation requested/i)).toBeVisible();

  const createCalls = state.rpcCalls.filter(({ command }) => command === "m1_create_audio_brief");
  const generationCalls = state.rpcCalls.filter(
    ({ command }) => command === "m1_request_generation",
  );
  expect(createCalls).toHaveLength(1);
  expect(generationCalls).toHaveLength(1);
  expect(generationCalls[0]?.body).toEqual(
    expect.objectContaining({
      p_brief_id: briefId,
      p_idempotency_key: expect.stringMatching(/^strongr-daily-v2-/),
      p_organization_id: organizationA,
    }),
  );
  expect(createCalls[0]?.body.p_correlation_id).toBe(generationCalls[0]?.body.p_correlation_id);
});

test("AAL2 authority targets canonical evidence, packages without publishing, and revokes append-only", async ({
  page,
}, testInfo) => {
  const state = await installMockSupabase(page);
  await signIn(page);
  await page.getByRole("link", { name: "Security" }).click();
  await page.getByLabel("Six-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Step up session" }).click();
  await expect(page.getByText("AAL2", { exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Active organization" }).selectOption(organizationA);
  await page.getByRole("link", { name: "Governed content" }).click();
  await expect(page.getByRole("heading", { name: "Approve exact evidence bundle" })).toBeVisible();

  await page.getByRole("checkbox", { name: /I confirm approval targets version 1/ }).check();
  await page.getByRole("button", { name: "Approve exact version" }).click();
  await expect(page.getByText(/Version 1 approval completed/i)).toBeVisible();

  await page
    .getByRole("checkbox", { name: /I confirm this creates an immutable package manifest only/ })
    .check();
  await page.getByRole("button", { name: "Create immutable package" }).click();
  await expect(page.getByText(/Immutable production package created/i)).toBeVisible();
  await expect(
    page.getByText(new RegExp(`Package already exists: ${productionPackageId}`)),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: /I confirm this append-only revocation/ }).check();
  await page.getByRole("button", { name: "Revoke exact approval" }).click();
  await expect(page.getByText(/Approval revocation recorded/i)).toBeVisible();

  const approvalCall = state.rpcCalls.find(({ command }) => command === "m1_approve_version");
  expect(approvalCall?.body).toEqual(
    expect.objectContaining({
      p_check_run_id: checkRunId,
      p_content_version_id: contentVersionId,
      p_editorial_review_id: editorialReviewId,
      p_organization_id: organizationA,
      p_review_policy_id: reviewPolicyId,
      p_rights_snapshot_id: rightsSnapshotId,
      p_scripture_evidence_id: scriptureEvidenceId,
      p_scripture_review_id: scriptureReviewId,
      p_theology_review_id: theologyReviewId,
    }),
  );
  expect(
    state.rpcCalls.find(({ command }) => command === "m1_create_production_package")?.body,
  ).toEqual(
    expect.objectContaining({
      p_approval_snapshot_id: approvalSnapshotId,
      p_organization_id: organizationA,
    }),
  );
  expect(state.rpcCalls.find(({ command }) => command === "m1_revoke_approval")?.body).toEqual(
    expect.objectContaining({
      p_approval_snapshot_id: approvalSnapshotId,
      p_organization_id: organizationA,
      p_reason_code: "evidence_changed",
    }),
  );
  expect(state.packageCreated).toBe(true);
  expect(state.approvalRevoked).toBe(true);

  await writeFile(
    resolve(evidenceRoot, `governed-authority-${testInfo.project.name}.json`),
    `${JSON.stringify(
      {
        approval_snapshot_id: approvalSnapshotId,
        content_version_id: contentVersionId,
        package_created_without_publication: state.packageCreated,
        revocation_append_only: state.approvalRevoked,
        rpc_commands: state.rpcCalls.map(({ command }) => command),
        status: "pass",
      },
      null,
      2,
    )}\n`,
  );
});

test("private media is checksum verified, human reviewed, staged, and revoked by exact identity", async ({
  page,
}, testInfo) => {
  const state = await installMockSupabase(page);
  state.packageCreated = true;
  await signIn(page);
  await page.getByRole("link", { name: "Security" }).click();
  await page.getByLabel("Six-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Step up session" }).click();
  await expect(page.getByText("AAL2", { exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Active organization" }).selectOption(organizationA);
  await page.getByRole("link", { name: "Governed media" }).click();
  await expect(
    page.getByRole("heading", { name: "Private audio through revocable release staging." }),
  ).toBeVisible();

  await page
    .getByRole("checkbox", { name: /I confirm the exact package and output specification/ })
    .check();
  await page.getByRole("button", { name: "Request exact media" }).click();
  await expect(page.getByText(new RegExp(`Job ${mediaJobId} · succeeded`))).toBeVisible();

  await page.getByRole("button", { name: "Verify private artifact" }).click();
  await expect(page.getByText(new RegExp(`Verified ${mediaBytes.byteLength} bytes`))).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(1);

  await page
    .getByRole("checkbox", { name: /I confirm this human decision targets artifact/ })
    .check();
  await page.getByRole("button", { name: "Record exact media review" }).click();
  await expect(page.getByText(new RegExp(`Review ${mediaReviewId} · approved`))).toBeVisible();

  await page
    .getByRole("checkbox", {
      name: /I confirm these exact package, artifact, and review identities/,
    })
    .check();
  await page.getByRole("button", { name: "Stage exact release bundle" }).click();
  await expect(page.getByText(new RegExp(`Bundle ${stagedReleaseId}`))).toContainText(
    "staged, not published",
  );

  await page
    .getByRole("checkbox", { name: /I confirm this append-only revocation targets/ })
    .check();
  await page.getByRole("button", { name: "Revoke exact staged bundle" }).click();
  await expect(page.getByText(new RegExp(`Bundle ${stagedReleaseId}`))).toContainText("revoked");

  expect(state.rpcCalls.find(({ command }) => command === "m2_request_media")?.body).toEqual(
    expect.objectContaining({
      p_adapter_key: "strongr.synthetic_audio",
      p_adapter_version: "1.0.0",
      p_idempotency_key: expect.stringMatching(/^studio-m3-3-/),
      p_organization_id: organizationA,
      p_output_spec_id: mediaOutputSpecId,
      p_production_package_id: productionPackageId,
    }),
  );
  expect(state.rpcCalls.find(({ command }) => command === "m2_record_media_review")?.body).toEqual(
    expect.objectContaining({
      p_accessibility_status: "approved",
      p_decision: "approved",
      p_media_artifact_id: mediaArtifactId,
      p_organization_id: organizationA,
      p_transcript_status: "ready",
    }),
  );
  expect(state.rpcCalls.find(({ command }) => command === "m2_stage_release")?.body).toEqual(
    expect.objectContaining({
      p_media_artifact_id: mediaArtifactId,
      p_media_review_id: mediaReviewId,
      p_organization_id: organizationA,
      p_production_package_id: productionPackageId,
    }),
  );
  expect(
    state.rpcCalls.find(({ command }) => command === "m2_revoke_staged_release")?.body,
  ).toEqual(
    expect.objectContaining({
      p_organization_id: organizationA,
      p_reason_code: "m3_3_release_withdrawn",
      p_staged_release_bundle_id: stagedReleaseId,
    }),
  );
  expect(state.storageRequests).toEqual([
    `/storage/v1/object/authenticated/strongr-os-media/${organizationA}/${productionPackageId}/${mediaArtifactId}.wav`,
  ]);

  await writeFile(
    resolve(evidenceRoot, `governed-media-${testInfo.project.name}.json`),
    `${JSON.stringify(
      {
        artifact_id: mediaArtifactId,
        byte_count: mediaBytes.byteLength,
        checksum_verified: mediaSha256,
        private_exact_download_count: state.storageRequests.length,
        release_revoked: state.releaseRevoked,
        release_staged_without_publication: state.releaseStaged,
        status: "pass",
      },
      null,
      2,
    )}\n`,
  );
});

test("M3.3 routes have no automatically detectable WCAG 2.2 A or AA violations", async ({
  page,
}, testInfo) => {
  const routeResults: Record<string, unknown> = {};
  const violations: unknown[] = [];
  await installMockSupabase(page);

  await page.goto("/sign-in");
  const signInResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  routeResults["/sign-in"] = {
    violations: signInResults.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length })),
  };
  violations.push(...signInResults.violations.map(({ id }) => ({ id, route: "/sign-in" })));

  await signIn(page);
  await page.getByRole("combobox", { name: "Active organization" }).selectOption(organizationA);
  for (const route of [
    "/",
    "/work",
    "/content",
    "/media",
    "/security",
    "/boundaries",
    "/missing-screen",
  ]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    routeResults[route] = {
      incomplete: results.incomplete.map(({ id, nodes }) => ({ id, nodes: nodes.length })),
      violations: results.violations.map(({ help, id, impact, nodes }) => ({
        help,
        id,
        impact,
        nodes: nodes.length,
      })),
    };
    violations.push(...results.violations.map(({ id }) => ({ id, route })));
  }

  await writeFile(
    resolve(evidenceRoot, `axe-${testInfo.project.name}.json`),
    `${JSON.stringify(routeResults, null, 2)}\n`,
  );
  expect(violations).toEqual([]);
});

test("authenticated M3.3 remains usable without horizontal overflow", async ({ page }) => {
  const state = await installMockSupabase(page);
  state.packageCreated = true;
  state.mediaReady = true;
  await signIn(page);
  await page.getByRole("combobox", { name: "Active organization" }).selectOption(organizationA);
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/media");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
