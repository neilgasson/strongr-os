import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const clientRoots = ["apps/studio", "dist/apps/studio"];
const forbiddenTokens = [
  "STRONGR_OS_DATABASE_URL",
  "STRONGR_OS_SUPABASE_SECRET_KEY",
  "STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY",
  "@strongr/worker",
  "apps/worker",
];
const directMutation = /\.(?:delete|insert|update|upsert)\s*\(/;
const secretLiteral = /\bsb_secret_[A-Za-z0-9_-]{8,}\b/;

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if ([".js", ".json", ".ts"].includes(extname(entry.name))) {
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
    if (secretLiteral.test(content)) {
      violations.push(`${relativePath}: privileged Supabase key literal`);
    }
  }
}

console.log(
  JSON.stringify({
    check: "m1_environment_boundaries",
    scanned_files: scannedFiles,
    status: violations.length === 0 ? "pass" : "fail",
    violations,
  }),
);

if (violations.length > 0) {
  process.exitCode = 1;
}
