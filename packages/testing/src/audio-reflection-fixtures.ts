import type { GenerationRequest } from "../../ai/src/index.ts";
import type {
  AudioReflectionBrief,
  StrongrDailyAudioReflectionV2Brief,
} from "../../content-schemas/src/index.ts";

export const fixtureIds = Object.freeze({
  correlationId: "00000000-0000-4000-8000-000000000004",
  generationJobId: "00000000-0000-4000-8000-000000000003",
  organizationAlphaId: "00000000-0000-4000-8000-000000000001",
  organizationBetaId: "00000000-0000-4000-8000-000000000002",
});

export const contentProfileSelectionFixture = Object.freeze({
  canonical_checksum: "a".repeat(64),
  content_type: "audio_reflection",
  profile_id: "strongr_daily.synthetic_audio_reflection",
  profile_version: 1,
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

export const strongrDailyAudioReflectionV2BriefFixture: StrongrDailyAudioReflectionV2Brief =
  Object.freeze({
    audience: "Adults seeking a quiet, Scripture-rooted daily reflection",
    content_profile: contentProfileSelectionFixture,
    content_type: "audio_reflection",
    desired_duration_seconds: 300,
    pastoral_purpose: "Invite a gentle, faithful response without promising outcomes.",
    prohibited_claims_or_wording: ["Do not promise healing, wealth, or a guaranteed outcome."],
    required_elements: ["welcome", "Scripture", "reflection", "prayer", "closing"],
    schema_id: "strongr.strongr_daily_audio_reflection_brief.v2",
    scripture_reference: {
      reference: "Psalm 46:10",
      source_citation: "KJV public-domain reference; quotation requires human verification",
      translation: "KJV",
    },
    source_brief_identifier: "strongr-daily-fixture-psalm-46-10",
    theme: "being still before God",
    tone: "reflective",
    working_title: "Be Still Today",
  });

export function createGenerationRequestFixture(
  overrides: Partial<GenerationRequest> = {},
): GenerationRequest {
  return {
    brief: audioReflectionBriefFixture,
    contentProfile: null,
    contentProfileSourceManifestChecksum: null,
    correlationId: fixtureIds.correlationId,
    generationJobId: fixtureIds.generationJobId,
    organizationId: fixtureIds.organizationAlphaId,
    promptKey: "strongr.audio_reflection.fixture",
    promptVersion: 1,
    ...overrides,
  };
}
