import type { GenerationRequest } from "../../ai/src/index.ts";
import type { AudioReflectionBrief } from "../../content-schemas/src/index.ts";

export const fixtureIds = Object.freeze({
  correlationId: "00000000-0000-4000-8000-000000000004",
  generationJobId: "00000000-0000-4000-8000-000000000003",
  organizationAlphaId: "00000000-0000-4000-8000-000000000001",
  organizationBetaId: "00000000-0000-4000-8000-000000000002",
});

export const audioReflectionBriefFixture: AudioReflectionBrief = Object.freeze({
  audience: "Synthetic adult test audience",
  constraints: [
    "Use synthetic content only",
    "Do not treat generated output as reviewed or approved",
  ],
  objectives: ["Practice reflective attention", "Preserve human review authority"],
  schema_id: "strongr.audio_reflection_brief.v1",
  scripture_references: [
    {
      reference: "Synthetic Reference 1:1",
      source_citation: "Synthetic fixture; not a Scripture quotation",
      translation: "TEST",
    },
  ],
  target_duration_seconds: 300,
  theme: "A deterministic, non-production reflection fixture",
  title: "Synthetic Reflection Fixture",
  tone: "reflective",
});

export function createGenerationRequestFixture(
  overrides: Partial<GenerationRequest> = {},
): GenerationRequest {
  return {
    brief: audioReflectionBriefFixture,
    correlationId: fixtureIds.correlationId,
    generationJobId: fixtureIds.generationJobId,
    organizationId: fixtureIds.organizationAlphaId,
    promptKey: "strongr.audio_reflection.fixture",
    promptVersion: 1,
    ...overrides,
  };
}
