import Schema from "typebox/schema";
import Type from "typebox";

export const audioReflectionBriefSchemaId = "strongr.audio_reflection_brief.v1" as const;
export const audioReflectionSchemaId = "strongr.audio_reflection.v1" as const;
export const strongrDailyAudioReflectionV2BriefSchemaId =
  "strongr.strongr_daily_audio_reflection_brief.v2" as const;
export const strongrDailyAudioReflectionV2SchemaId =
  "strongr.strongr_daily_audio_reflection.v2" as const;

const scriptureReferenceSchema = Type.Object(
  {
    reference: Type.String({ minLength: 1, maxLength: 160, pattern: "\\S" }),
    source_citation: Type.String({ minLength: 1, maxLength: 500, pattern: "\\S" }),
    translation: Type.String({ minLength: 1, maxLength: 80, pattern: "\\S" }),
  },
  { additionalProperties: false },
);

export const audioReflectionBriefSchema = Type.Object(
  {
    audience: Type.String({ minLength: 1, maxLength: 160, pattern: "\\S" }),
    constraints: Type.Array(Type.String({ minLength: 1, maxLength: 500, pattern: "\\S" }), {
      maxItems: 12,
    }),
    objectives: Type.Array(Type.String({ minLength: 1, maxLength: 500, pattern: "\\S" }), {
      maxItems: 8,
      minItems: 1,
    }),
    schema_id: Type.Literal(audioReflectionBriefSchemaId),
    scripture_references: Type.Array(scriptureReferenceSchema, { maxItems: 12, minItems: 1 }),
    target_duration_seconds: Type.Integer({ maximum: 1_200, minimum: 60 }),
    theme: Type.String({ minLength: 1, maxLength: 500, pattern: "\\S" }),
    title: Type.String({ minLength: 1, maxLength: 200, pattern: "\\S" }),
    tone: Type.Union([
      Type.Literal("challenging"),
      Type.Literal("encouraging"),
      Type.Literal("pastoral"),
      Type.Literal("reflective"),
    ]),
  },
  {
    $id: "https://strongr.os/schemas/strongr.audio_reflection_brief.v1.json",
    additionalProperties: false,
  },
);

export const audioReflectionSchema = Type.Object(
  {
    closing: Type.String({ minLength: 1, maxLength: 4_000, pattern: "\\S" }),
    opening: Type.String({ minLength: 1, maxLength: 4_000, pattern: "\\S" }),
    reflection: Type.String({ minLength: 1, maxLength: 20_000, pattern: "\\S" }),
    reflection_questions: Type.Array(
      Type.String({ minLength: 1, maxLength: 500, pattern: "\\S" }),
      { maxItems: 5, minItems: 1 },
    ),
    schema_id: Type.Literal(audioReflectionSchemaId),
    scripture_references: Type.Array(scriptureReferenceSchema, { maxItems: 12, minItems: 1 }),
    title: Type.String({ minLength: 1, maxLength: 200, pattern: "\\S" }),
  },
  {
    $id: "https://strongr.os/schemas/strongr.audio_reflection.v1.json",
    additionalProperties: false,
  },
);

const text = (maximum: number) => Type.String({ minLength: 1, maxLength: maximum, pattern: "\\S" });

export const strongrDailyAudioReflectionV2BriefSchema = Type.Object(
  {
    audience: text(160),
    content_type: Type.Literal("audio_reflection"),
    desired_duration_seconds: Type.Integer({ maximum: 1_200, minimum: 60 }),
    pastoral_purpose: text(1_000),
    prohibited_claims_or_wording: Type.Array(text(500), { maxItems: 12 }),
    required_elements: Type.Array(text(500), { maxItems: 12, minItems: 1 }),
    schema_id: Type.Literal(strongrDailyAudioReflectionV2BriefSchemaId),
    scripture_reference: scriptureReferenceSchema,
    source_brief_identifier: text(160),
    theme: text(500),
    tone: Type.Union([
      Type.Literal("challenging"), Type.Literal("encouraging"), Type.Literal("pastoral"), Type.Literal("reflective"),
    ]),
    working_title: text(200),
  },
  { $id: "https://strongr.os/schemas/strongr.strongr_daily_audio_reflection_brief.v2.json", additionalProperties: false },
);

export const strongrDailyAudioReflectionV2Schema = Type.Object(
  {
    app_description: text(1_000),
    artwork_generation_prompt: text(2_000),
    audience: text(160),
    closing: text(4_000),
    content_hash: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    content_type: Type.Literal("audio_reflection"),
    estimated_duration_seconds: Type.Integer({ maximum: 1_200, minimum: 60 }),
    final_title: text(200),
    keywords: Type.Array(text(80), { maxItems: 12, minItems: 1 }),
    narration_text: text(30_000),
    pastoral_purpose: text(1_000),
    personal_takeaway_prompt: text(500),
    prayer: text(4_000),
    prayer_request_prompt: Type.Optional(text(500)),
    prohibited_claims_or_wording: Type.Array(text(500), { maxItems: 12 }),
    reflective_transition: text(2_000),
    schema_id: Type.Literal(strongrDailyAudioReflectionV2SchemaId),
    scripture_introduction: text(4_000),
    scripture_reference: scriptureReferenceSchema,
    scripture_text: Type.Optional(text(10_000)),
    short_summary: text(500),
    soft_music_fade_instruction: Type.Optional(text(500)),
    social_caption: text(1_000),
    source_brief_identifier: text(160),
    tone: Type.Union([Type.Literal("challenging"), Type.Literal("encouraging"), Type.Literal("pastoral"), Type.Literal("reflective")]),
    warm_welcome: text(4_000),
  },
  { $id: "https://strongr.os/schemas/strongr.strongr_daily_audio_reflection.v2.json", additionalProperties: false },
);

export type AudioReflectionBrief = Type.Static<typeof audioReflectionBriefSchema>;
export type AudioReflection = Type.Static<typeof audioReflectionSchema>;
export type StrongrDailyAudioReflectionV2Brief = Type.Static<typeof strongrDailyAudioReflectionV2BriefSchema>;
export type StrongrDailyAudioReflectionV2 = Type.Static<typeof strongrDailyAudioReflectionV2Schema>;

const audioReflectionBriefValidator = Schema.Compile(audioReflectionBriefSchema);
const audioReflectionValidator = Schema.Compile(audioReflectionSchema);
const strongrDailyAudioReflectionV2BriefValidator = Schema.Compile(strongrDailyAudioReflectionV2BriefSchema);
const strongrDailyAudioReflectionV2Validator = Schema.Compile(strongrDailyAudioReflectionV2Schema);

export function parseAudioReflectionBrief(value: unknown): AudioReflectionBrief {
  return audioReflectionBriefValidator.Parse(value);
}

export function parseAudioReflection(value: unknown): AudioReflection {
  return audioReflectionValidator.Parse(value);
}

export function parseStrongrDailyAudioReflectionV2Brief(value: unknown): StrongrDailyAudioReflectionV2Brief {
  return strongrDailyAudioReflectionV2BriefValidator.Parse(value);
}

export function parseStrongrDailyAudioReflectionV2(value: unknown): StrongrDailyAudioReflectionV2 {
  return strongrDailyAudioReflectionV2Validator.Parse(value);
}
