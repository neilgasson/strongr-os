import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
// Source code is the authority for this policy. Built assets are verified by
// validate-m3-browser-foundation.ts, where minified strings cannot be mistaken
// for source-level database calls.
const clientRoots = ["apps/studio/src"];
const forbiddenTokens = [
  "OPENAI_API_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRONGR_OS_DATABASE_URL",
  "STRONGR_OS_OPENAI_API_KEY",
  "STRONGR_OS_SUPABASE_SECRET_KEY",
  "STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY",
  "@strongr/worker",
  "apps/worker",
];
const directMutation =
  /\.from\s*\([^)]{0,200}\)[\s\S]{0,200}\.\s*(?:delete|insert|update|upsert)\s*\(/;
const storageMutationOrListing =
  /\.(?:copy|createSignedUploadUrl|getPublicUrl|list|move|remove|upload)\s*\(/;
const secretLiteral = /\bsb_secret_[A-Za-z0-9_-]{8,}\b/;
const openAiSecretLiteral = /\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{16,}\b/;
const managedStorageMutation =
  /\b(?:delete\s+from|insert\s+into|update)\s+storage\.(?:buckets|objects)\b/i;

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (
      [
        ".css",
        ".html",
        ".js",
        ".json",
        ".log",
        ".map",
        ".md",
        ".mjs",
        ".sql",
        ".ts",
        ".tsx",
        ".txt",
      ].includes(extname(entry.name))
    ) {
      files.push(path);
    }
  }
  return files;
}

const violations: string[] = [];
let scannedFiles = 0;

for (const relativeRoot of clientRoots) {
  for (const path of await collectFiles(resolve(repositoryRoot, relativeRoot))) {
    scannedFiles += 1;
    const content = await readFile(path, "utf8");
    const relativePath = path.slice(repositoryRoot.length + 1).replaceAll("\\", "/");

    for (const token of forbiddenTokens) {
      if (content.includes(token)) {
        violations.push(`${relativePath}: forbidden client token ${token}`);
      }
    }
    if (directMutation.test(content)) {
      violations.push(`${relativePath}: direct governed-table mutation pattern`);
    }
    if (storageMutationOrListing.test(content)) {
      violations.push(`${relativePath}: forbidden browser Storage operation`);
    }
    if (secretLiteral.test(content)) {
      violations.push(`${relativePath}: privileged Supabase key literal`);
    }
    if (openAiSecretLiteral.test(content)) {
      violations.push(`${relativePath}: OpenAI key literal`);
    }
  }
}

// Durable acceptance evidence may safely name configuration boundaries, but it
// must never preserve a provider credential value.
for (const path of await collectFiles(resolve(repositoryRoot, "evidence"))) {
  const content = await readFile(path, "utf8");
  const relativePath = path.slice(repositoryRoot.length + 1).replaceAll("\\", "/");
  if (openAiSecretLiteral.test(content)) {
    violations.push(`${relativePath}: OpenAI key literal in evidence`);
  }
}

const configPath = resolve(repositoryRoot, "supabase/config.toml");
const storageConfig = await readFile(configPath, "utf8");
for (const requiredLine of [
  "[storage.buckets.strongr-os-media]",
  "public = false",
  'file_size_limit = "25MiB"',
  'allowed_mime_types = ["audio/wav"]',
]) {
  if (!storageConfig.includes(requiredLine)) {
    violations.push(`supabase/config.toml: missing private media boundary ${requiredLine}`);
  }
}

for (const path of await collectFiles(resolve(repositoryRoot, "supabase/migrations"))) {
  const content = await readFile(path, "utf8");
  if (managedStorageMutation.test(content)) {
    const relativePath = path.slice(repositoryRoot.length + 1).replaceAll("\\", "/");
    violations.push(`${relativePath}: direct managed Storage metadata mutation`);
  }
}

console.log(
  JSON.stringify({
    check: "m2_environment_boundaries",
    scanned_files: scannedFiles,
    status: violations.length === 0 ? "pass" : "fail",
    violations,
  }),
);

if (violations.length > 0) {
  process.exitCode = 1;
}
