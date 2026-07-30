import { createHash } from "node:crypto";

import {
  audioReflectionSchemaId,
  parseAudioReflection,
  parseStrongrDailyAudioReflectionV2,
  strongrDailyAudioReflectionV2SchemaId,
  type StrongrDailyAudioReflectionV2Brief,
} from "../../content-schemas/src/index.ts";
import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
} from "./generation-adapter.ts";
import {
  createGenerationOutputHash,
  createGenerationPromptChecksum,
} from "./generation-adapter.ts";

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
    return "[" + value.map((item) => canonicalJson(item)).join(",") + "]";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return "{" + entries
      .map(([key, item]) => JSON.stringify(key) + ":" + canonicalJson(item))
      .join(",") + "}";
  }
  throw new Error("Canonical JSON supports JSON values only");
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function createStrongrDailyV2FixtureOutput(brief: StrongrDailyAudioReflectionV2Brief) {
  const base = {
    app_description: "A guided reflection on " + brief.theme.toLowerCase() + " for " + brief.audience + ".",
    artwork_generation_prompt:
      "Warm, quiet dawn light for a Christian audio reflection about " + brief.theme + "; no text or people.",
    audience: brief.audience,
    closing: "Thank You for meeting us here. Carry this truth with you today.",
    content_type: "audio_reflection" as const,
    estimated_duration_seconds: brief.desired_duration_seconds,
    final_title: brief.working_title,
    keywords: ["Strongr Daily", "reflection", brief.theme],
    narration_text:
      "Welcome. " + brief.theme + ". Let us turn to " + brief.scripture_reference.reference +
      ". Pause for a moment. " + brief.pastoral_purpose +
      ". Let us pray. Lord, help us receive Your wisdom with humility and hope. Amen. Thank You for this moment together.",
    pastoral_purpose: brief.pastoral_purpose,
    personal_takeaway_prompt: "What is one faithful next step you can take today?",
    prayer: "Lord, help us receive Your wisdom with humility and hope. Amen.",
    prohibited_claims_or_wording: brief.prohibited_claims_or_wording,
    reflective_transition: "Take a slow breath and hold this Scripture in quiet attention.",
    schema_id: strongrDailyAudioReflectionV2SchemaId,
    scripture_introduction: "Today we are reflecting on " + brief.scripture_reference.reference + ".",
    scripture_reference: brief.scripture_reference,
    short_summary: "A short reflection on " + brief.theme + ".",
    social_caption: "A quiet Strongr Daily reflection on " + brief.theme + ".",
    source_brief_identifier: brief.source_brief_identifier,
    tone: brief.tone,
    warm_welcome: "Welcome. Take a quiet moment as we consider " + brief.theme + ".",
  };
  const content_hash = createGenerationOutputHash({ ...base, content_hash: "0".repeat(64) });
  return parseStrongrDailyAudioReflectionV2({ ...base, content_hash });
}

function createFixtureOutput(request: GenerationRequest) {
  const { brief } = request;
  if (brief.schema_id === "strongr.strongr_daily_audio_reflection_brief.v2") {
    return createStrongrDailyV2FixtureOutput(brief);
  }
  return parseAudioReflection({
    closing: "Synthetic closing fixture for “" + brief.title + "”. Human review is still required.",
    opening: "Synthetic opening fixture for " + brief.audience + ": " + brief.theme,
    reflection: "Synthetic reflection fixture covering: " + brief.objectives.join("; ") + ".",
    reflection_questions: brief.objectives
      .slice(0, 3)
      .map((objective) => "What would it look like to reflect on: " + objective + "?"),
    schema_id: audioReflectionSchemaId,
    scripture_references: brief.scripture_references,
    title: brief.title,
  });
}

export const deterministicGenerationAdapter: GenerationAdapter = Object.freeze({
  identity: deterministicAdapterIdentity,
  generate(request: GenerationRequest): Promise<GenerationResult> {
    const output = createFixtureOutput(request);
    const outputHash = createGenerationOutputHash(output);
    const promptChecksum = createGenerationPromptChecksum(request.promptKey, request.promptVersion);

    return Promise.resolve({
      ...deterministicAdapterIdentity,
      output,
      outputHash,
      promptChecksum,
      providerResponseId: "fixture-" + sha256({ request, output }).slice(0, 32),
      responseSchemaId: output.schema_id,
    });
  },
});
