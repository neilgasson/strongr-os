import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  audioReflectionBriefSchema,
  audioReflectionSchema,
} from "../../packages/content-schemas/src/index.ts";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const checkOnly = process.argv.includes("--check");
const generatedSchemas = new Map<string, unknown>([
  [
    "packages/content-schemas/schema/strongr.audio_reflection_brief.v1.json",
    audioReflectionBriefSchema,
  ],
  ["packages/content-schemas/schema/strongr.audio_reflection.v1.json", audioReflectionSchema],
]);

let driftFound = false;

for (const [relativePath, schema] of generatedSchemas) {
  const target = resolve(repositoryRoot, relativePath);
  const expected = `${JSON.stringify(schema, null, 2)}\n`;

  if (checkOnly) {
    const actual = await readFile(target, "utf8").catch(() => "");
    if (actual !== expected) {
      console.error(`Generated schema is missing or stale: ${relativePath}`);
      driftFound = true;
    }
    continue;
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, expected, "utf8");
  console.log(`Generated ${relativePath}`);
}

if (driftFound) {
  process.exitCode = 1;
}
