import { createHash } from "node:crypto";

import { audioReflectionSchemaId, parseAudioReflection } from "../../content-schemas/src/index.ts";
import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from "./generation-adapter.ts";
import { createGenerationPromptChecksum } from "./generation-adapter.ts";

export const deterministicAdapterIdentity = Object.freeze({
  model: "strongr.fixture.audio-reflection.v1",
  provider: "deterministic-test",
});

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical JSON does not support non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  throw new Error("Canonical JSON supports JSON values only");
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function createFixtureOutput(request: GenerationRequest) {
  const { brief } = request;
  return parseAudioReflection({
    closing: `Synthetic closing fixture for “${brief.title}”. Human review is still required.`,
    opening: `Synthetic opening fixture for ${brief.audience}: ${brief.theme}`,
    reflection: `Synthetic reflection fixture covering: ${brief.objectives.join("; ")}.`,
    reflection_questions: brief.objectives
      .slice(0, 3)
      .map((objective) => `What would it look like to reflect on: ${objective}?`),
    schema_id: audioReflectionSchemaId,
    scripture_references: brief.scripture_references,
    title: brief.title,
  });
}

export const deterministicGenerationAdapter: GenerationAdapter = Object.freeze({
  identity: deterministicAdapterIdentity,
  generate(request: GenerationRequest): Promise<GenerationResult> {
    const output = createFixtureOutput(request);
    const outputHash = sha256(output);
    const promptChecksum = createGenerationPromptChecksum(request.promptKey, request.promptVersion);

    return Promise.resolve({
      ...deterministicAdapterIdentity,
      output,
      outputHash,
      promptChecksum,
      providerResponseId: `fixture-${sha256({ request, output }).slice(0, 32)}`,
      responseSchemaId: audioReflectionSchemaId,
    });
  },
});
