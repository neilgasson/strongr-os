import Schema from "typebox/schema";
import Type from "typebox";

export const audioReflectionBriefSchemaId = "strongr.audio_reflection_brief.v1" as const;
export const audioReflectionSchemaId = "strongr.audio_reflection.v1" as const;

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

export type AudioReflectionBrief = Type.Static<typeof audioReflectionBriefSchema>;
export type AudioReflection = Type.Static<typeof audioReflectionSchema>;

const audioReflectionBriefValidator = Schema.Compile(audioReflectionBriefSchema);
const audioReflectionValidator = Schema.Compile(audioReflectionSchema);

export function parseAudioReflectionBrief(value: unknown): AudioReflectionBrief {
  return audioReflectionBriefValidator.Parse(value);
}

export function parseAudioReflection(value: unknown): AudioReflection {
  return audioReflectionValidator.Parse(value);
}
