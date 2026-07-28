import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const studioBuild = resolve(repositoryRoot, "apps/studio/dist");
const hostedBuild = resolve(repositoryRoot, "dist");
const evidenceRoot = resolve(
  repositoryRoot,
  process.env.STRONGR_OS_M3_ARTIFACT_DIR ?? "artifacts/m3-preview",
  "preview-static",
);

async function collectFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else {
      files.push(path);
    }
  }
  return files;
}

await rm(hostedBuild, { force: true, recursive: true });
await mkdir(resolve(hostedBuild, "client"), { recursive: true });
await mkdir(resolve(hostedBuild, "server"), { recursive: true });
await mkdir(resolve(hostedBuild, ".openai"), { recursive: true });
await mkdir(evidenceRoot, { recursive: true });

await cp(studioBuild, resolve(hostedBuild, "client"), { recursive: true });
await copyFile(
  resolve(repositoryRoot, "apps/studio/preview-worker.mjs"),
  resolve(hostedBuild, "server/index.js"),
);
await copyFile(
  resolve(repositoryRoot, ".openai/hosting.json"),
  resolve(hostedBuild, ".openai/hosting.json"),
);

const files = (await collectFiles(hostedBuild)).sort();
const manifest = [];
for (const path of files) {
  const digest = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  manifest.push(`${digest}  ${relative(repositoryRoot, path).replaceAll("\\", "/")}`);
}
await writeFile(resolve(evidenceRoot, "SHA256SUMS"), `${manifest.join("\n")}\n`, "utf8");
await writeFile(
  resolve(evidenceRoot, "summary.json"),
  `${JSON.stringify(
    {
      artifact_directory: relative(repositoryRoot, hostedBuild).replaceAll("\\", "/"),
      check: "m3_preview_static_package",
      file_count: files.length,
      sha: process.env.GITHUB_SHA ?? "local",
      status: "pass",
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  JSON.stringify({
    artifact_directory: relative(repositoryRoot, hostedBuild).replaceAll("\\", "/"),
    file_count: files.length,
    status: "pass",
  }),
);
