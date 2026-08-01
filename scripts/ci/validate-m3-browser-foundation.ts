import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const violations: string[] = [];

function record(condition: boolean, message: string): void {
  if (!condition) {
    violations.push(message);
  }
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if ([".css", ".html", ".js", ".json", ".map", ".mjs"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

const packagePath = resolve(repositoryRoot, "apps/studio/package.json");
const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
};
const dependencies = packageJson.dependencies ?? {};
const exactRuntimeDependencies = new Set([
  "@supabase/auth-js",
  "react",
  "react-dom",
  "react-router-dom",
]);
record(
  Object.keys(dependencies).every((name) => exactRuntimeDependencies.has(name)),
  "apps/studio/package.json: unreviewed runtime dependency",
);
record(
  [...exactRuntimeDependencies].every(
    (name) => typeof dependencies[name] === "string" && /^\d+\.\d+\.\d+$/.test(dependencies[name]),
  ),
  "apps/studio/package.json: runtime dependencies must be exact pinned versions",
);
for (const forbiddenPackage of [
  "@supabase/postgrest-js",
  "@supabase/storage-js",
  "@supabase/supabase-js",
]) {
  record(
    !(forbiddenPackage in dependencies),
    `apps/studio/package.json: ${forbiddenPackage} forbidden`,
  );
}
record(
  Object.values(packageJson.devDependencies ?? {}).every((version) =>
    /^\d+\.\d+\.\d+$/.test(version),
  ),
  "apps/studio/package.json: development dependencies must be exact pinned versions",
);

const securityPath = resolve(repositoryRoot, "apps/studio/preview-security.json");
const security = JSON.parse(await readFile(securityPath, "utf8")) as {
  readonly deployment_status?: string;
  readonly public_environment_allowlist?: readonly string[];
  readonly required_headers?: Readonly<Record<string, string>>;
  readonly runtime_scripts?: string;
  readonly runtime_configuration?: string;
  readonly spa_fallback?: string;
  readonly supabase_project_ref?: string;
};
record(
  security.deployment_status === "m3_4_owner_only_preview",
  "preview-security.json: M3.4 owner-only preview status missing",
);
record(security.spa_fallback === "/index.html", "preview-security.json: SPA fallback missing");
record(
  security.runtime_scripts === "self_only",
  "preview-security.json: runtime scripts not self-only",
);
record(
  JSON.stringify(security.public_environment_allowlist) ===
    JSON.stringify(["PUBLIC_SUPABASE_PUBLISHABLE_KEY", "PUBLIC_SUPABASE_URL"]),
  "preview-security.json: public environment allowlist changed",
);
record(
  security.supabase_project_ref === "fifrlyddmjkogmdvyjdp",
  "preview-security.json: preview must remain bound to strongr-os-dev",
);
record(
  security.runtime_configuration === "same_origin_no_store_json",
  "preview-security.json: reviewed runtime configuration missing",
);

const headers = security.required_headers ?? {};
for (const name of [
  "Cache-Control",
  "Content-Security-Policy",
  "Cross-Origin-Opener-Policy",
  "Permissions-Policy",
  "Referrer-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
]) {
  record(typeof headers[name] === "string", `preview-security.json: missing ${name}`);
}
const csp = headers["Content-Security-Policy"] ?? "";
for (const directive of [
  "base-uri 'none'",
  `connect-src 'self' \${PUBLIC_SUPABASE_ORIGIN}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
]) {
  record(csp.includes(directive), `preview-security.json: CSP missing ${directive}`);
}
record(!/unsafe-(?:eval|inline)/.test(csp), "preview-security.json: unsafe CSP directive");

const sourceIndex = await readFile(resolve(repositoryRoot, "apps/studio/index.html"), "utf8");
record(
  sourceIndex.includes('http-equiv="Content-Security-Policy"'),
  "apps/studio/index.html: local CSP defense missing",
);
record(!/unsafe-(?:eval|inline)/.test(sourceIndex), "apps/studio/index.html: unsafe CSP directive");
record(
  !/<script\b[^>]*\bsrc=["']https?:/i.test(sourceIndex),
  "apps/studio/index.html: remote runtime script",
);

const browserEnvironmentSource = await readFile(
  resolve(repositoryRoot, "apps/studio/src/browser-environment.ts"),
  "utf8",
);
for (const runtimeBoundary of [
  '"/runtime-config.json"',
  'cache: "no-store"',
  'credentials: "same-origin"',
]) {
  record(
    browserEnvironmentSource.includes(runtimeBoundary),
    `browser-environment.ts: missing runtime boundary ${runtimeBoundary}`,
  );
}

const bundleFiles = await collectFiles(resolve(repositoryRoot, "apps/studio/dist"));
record(bundleFiles.length > 0, "apps/studio/dist: built browser artifact missing");
const forbiddenBundleTokens = [
  "OPENAI_API_KEY",
  "STRONGR_OS_DATABASE_URL",
  "STRONGR_OS_OPENAI_API_KEY",
  "STRONGR_OS_SUPABASE_SECRET_KEY",
  "STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "@strongr/worker",
  "/storage/v1/object/list",
  "createSignedUploadUrl",
  "getPublicUrl",
];
for (const path of bundleFiles) {
  const content = await readFile(path, "utf8");
  const relativePath = path.slice(repositoryRoot.length + 1).replaceAll("\\", "/");
  for (const token of forbiddenBundleTokens) {
    if (content.includes(token)) {
      violations.push(`${relativePath}: forbidden browser bundle token ${token}`);
    }
  }
  if (/\bsb_secret_[A-Za-z0-9_-]{8,}\b/.test(content)) {
    violations.push(`${relativePath}: privileged Supabase key literal`);
  }
  if (/\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{16,}\b/.test(content)) {
    violations.push(`${relativePath}: OpenAI key literal`);
  }
  if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/.test(content)) {
    violations.push(`${relativePath}: JWT-like credential literal`);
  }
}

const identitySource = await readFile(
  resolve(repositoryRoot, "apps/studio/src/identity-gateway.ts"),
  "utf8",
);
for (const requiredIdentityBoundary of [
  "profile_id:",
  "eq.",
  'status: "eq.active"',
  "/rest/v1/rpc/has_permission",
  "membershipByOrganization.get(id)",
]) {
  record(
    identitySource.includes(requiredIdentityBoundary),
    `identity-gateway.ts: missing ${requiredIdentityBoundary}`,
  );
}
record(
  !identitySource.includes("user_metadata"),
  "identity-gateway.ts: user metadata must not authorize identity or tenant context",
);

const sessionSource = await readFile(
  resolve(repositoryRoot, "apps/studio/src/session-context.tsx"),
  "utf8",
);
for (const requiredAuthOperation of [
  "signInWithPassword",
  'signOut({ scope: "local" })',
  "mfa.enroll",
  "mfa.challenge",
  "mfa.verify",
  "mfa.listFactors",
  "mfa.unenroll",
  "mfa.getAuthenticatorAssuranceLevel",
  "refreshSession",
]) {
  record(
    sessionSource.includes(requiredAuthOperation),
    `session-context.tsx: missing supported Auth operation ${requiredAuthOperation}`,
  );
}
record(
  !sessionSource.includes("user_metadata"),
  "session-context.tsx: user metadata must not authorize browser state",
);

const governedContentSource = await readFile(
  resolve(repositoryRoot, "apps/studio/src/content-workspace-page.tsx"),
  "utf8",
);
for (const requiredGovernedOperation of [
  "flow.createBrief({",
  "flow.requestGeneration({",
  "GenerationRequestDeferredError",
  "GenerationRuntimeDeferredError",
  "createManualDraft",
  "submitDraft",
  "activateReviewPolicy",
  "recordScriptureEvidence",
  "recordRightsSnapshot",
  "recordReview",
  "approveVersion",
  "createProductionPackage",
  "revokeApproval",
  "newIdempotencyKey",
  "mutationLock",
  "confirmation-label",
]) {
  record(
    governedContentSource.includes(requiredGovernedOperation),
    `content-workspace-page.tsx: missing governed operation ${requiredGovernedOperation}`,
  );
}
for (const forbiddenGovernedToken of [
  "flow.createBriefAndRequestGeneration(",
  "service_role",
  "SUPABASE_SECRET",
  "/functions/v1/strongr-daily-generate",
  "/storage/v1/",
  "/rest/v1/content_briefs",
  "/rest/v1/content_versions",
  "/rest/v1/approval_snapshots",
  "/rest/v1/production_packages",
]) {
  record(
    !governedContentSource.includes(forbiddenGovernedToken),
    `content-workspace-page.tsx: direct or privileged browser token ${forbiddenGovernedToken}`,
  );
}
record(
  /const gateway = createStudioSupabaseGateway\(\{\s*accessToken: session\.access_token,\s*environment: environment\.value,\s*\}\);\s*return createStudioFoundation\(gateway, gateway, gateway, gateway\);/s.test(
    sessionSource,
  ),
  "session-context.tsx: reads, commands, media, and generation must share the authenticated Studio gateway",
);

const studioGatewaySource = await readFile(
  resolve(repositoryRoot, "apps/studio/src/supabase-http.ts"),
  "utf8",
);
for (const requiredGenerationBoundary of [
  "async startGeneration(",
  "/functions/v1/strongr-daily-generate",
  "generation_job_id: generationJobId",
]) {
  record(
    studioGatewaySource.includes(requiredGenerationBoundary),
    `supabase-http.ts: missing governed generation boundary ${requiredGenerationBoundary}`,
  );
}

const governedMediaSource = await readFile(
  resolve(repositoryRoot, "apps/studio/src/media-release-page.tsx"),
  "utf8",
);
for (const requiredMediaOperation of [
  "requestMedia",
  "downloadArtifact",
  "recordReview",
  "stageRelease",
  "revokeStagedRelease",
  "URL.createObjectURL",
  "URL.revokeObjectURL",
  "newIdempotencyKey",
  "mutationLock",
  "confirmation-label",
]) {
  record(
    governedMediaSource.includes(requiredMediaOperation),
    `media-release-page.tsx: missing governed operation ${requiredMediaOperation}`,
  );
}
for (const forbiddenMediaToken of [
  "service_role",
  "SUPABASE_SECRET",
  "/storage/v1/",
  "/rest/v1/media_",
  "/rest/v1/staged_",
  "localStorage",
  "sessionStorage",
  "caches.open",
  "getPublicUrl",
  "createSignedUrl",
]) {
  record(
    !governedMediaSource.includes(forbiddenMediaToken),
    `media-release-page.tsx: direct, persistent, or privileged browser token ${forbiddenMediaToken}`,
  );
}

const queueSource = await readFile(
  resolve(repositoryRoot, "apps/studio/src/work-queue.ts"),
  "utf8",
);
for (const requiredQueueRead of [
  "listBriefs",
  "listGenerationJobs",
  "listContentVersions",
  "listReviewDecisions",
  "listApprovalSnapshots",
  "listApprovalRevocations",
  "listProductionPackages",
  "listMediaJobs",
  "listMediaArtifacts",
  "listMediaReviews",
  "listStagedReleaseBundles",
  "listStagedReleaseRevocations",
]) {
  record(
    queueSource.includes(requiredQueueRead),
    `work-queue.ts: missing canonical read ${requiredQueueRead}`,
  );
}

const browserTestEnvironment = await readFile(
  resolve(repositoryRoot, "apps/studio/.env.browser-test"),
  "utf8",
);
record(
  browserTestEnvironment.includes("https://example.supabase.co") &&
    browserTestEnvironment.includes("sb_publishable_browser_acceptance_fixture"),
  "apps/studio/.env.browser-test: synthetic intercepted public configuration missing",
);
record(
  !/\bsb_secret_/.test(browserTestEnvironment),
  "apps/studio/.env.browser-test: privileged key forbidden",
);

console.log(
  JSON.stringify({
    bundle_files: bundleFiles.length,
    check: "m3_browser_foundation",
    status: violations.length === 0 ? "pass" : "fail",
    violations,
  }),
);

if (violations.length > 0) {
  process.exitCode = 1;
}
