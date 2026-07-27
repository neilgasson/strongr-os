import { readFile, readdir } from "node:fs/promises";
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
  readonly spa_fallback?: string;
};
record(
  security.deployment_status === "deferred_to_m3_4",
  "preview-security.json: M3.0 must not claim a deployment",
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

const bundleFiles = await collectFiles(resolve(repositoryRoot, "apps/studio/dist"));
record(bundleFiles.length > 0, "apps/studio/dist: built browser artifact missing");
const forbiddenBundleTokens = [
  "STRONGR_OS_DATABASE_URL",
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
  if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/.test(content)) {
    violations.push(`${relativePath}: JWT-like credential literal`);
  }
}

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
