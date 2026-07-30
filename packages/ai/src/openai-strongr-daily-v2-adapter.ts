import {
  parseStrongrDailyAudioReflectionV2,
  type StrongrDailyAudioReflectionV2Brief,
  strongrDailyAudioReflectionV2SchemaId,
} from "../../content-schemas/src/index.ts";
import type {
  GenerationAdapter,
  GenerationRequest,
  GenerationResult,
  GenerationUsage,
} from "./generation-adapter.ts";
import {
  createGenerationOutputHash,
  createGenerationPromptChecksum,
  GenerationProviderError,
} from "./generation-adapter.ts";

export interface OpenAiResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type OpenAiFetch = (
  input: string,
  init: {
    readonly body: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly method: "POST";
  },
) => Promise<OpenAiResponse>;

export interface OpenAiStrongrDailyV2AdapterOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly fetch?: OpenAiFetch;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const provider = "openai";
const endpoint = "https://api.openai.com/v1/responses";

const responseSchema = Object.freeze({
  additionalProperties: false,
  properties: {
    app_description: { type: "string" },
    artwork_generation_prompt: { type: "string" },
    audience: { type: "string" },
    closing: { type: "string" },
    content_type: { enum: ["audio_reflection"], type: "string" },
    estimated_duration_seconds: { maximum: 1200, minimum: 60, type: "integer" },
    final_title: { type: "string" },
    keywords: { items: { type: "string" }, minItems: 1, type: "array" },
    narration_text: { type: "string" },
    pastoral_purpose: { type: "string" },
    personal_takeaway_prompt: { type: "string" },
    prayer: { type: "string" },
    prohibited_claims_or_wording: { items: { type: "string" }, type: "array" },
    reflective_transition: { type: "string" },
    schema_id: { enum: [strongrDailyAudioReflectionV2SchemaId], type: "string" },
    scripture_introduction: { type: "string" },
    scripture_reference: {
      additionalProperties: false,
      properties: {
        reference: { type: "string" },
        source_citation: { type: "string" },
        translation: { type: "string" },
      },
      required: ["reference", "source_citation", "translation"],
      type: "object",
    },
    short_summary: { type: "string" },
    social_caption: { type: "string" },
    source_brief_identifier: { type: "string" },
    tone: { enum: ["challenging", "encouraging", "pastoral", "reflective"], type: "string" },
    warm_welcome: { type: "string" },
  },
  required: [
    "app_description",
    "artwork_generation_prompt",
    "audience",
    "closing",
    "content_type",
    "estimated_duration_seconds",
    "final_title",
    "keywords",
    "narration_text",
    "pastoral_purpose",
    "personal_takeaway_prompt",
    "prayer",
    "prohibited_claims_or_wording",
    "reflective_transition",
    "schema_id",
    "scripture_introduction",
    "scripture_reference",
    "short_summary",
    "social_caption",
    "source_brief_identifier",
    "tone",
    "warm_welcome",
  ],
  type: "object",
});

function requireRecord(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GenerationProviderError("generation.provider_invalid_response");
  }
  return value as UnknownRecord;
}

function requireSafeProviderId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(value)) {
    throw new GenerationProviderError("generation.provider_invalid_response");
  }
  return value;
}

function requireUsageCounter(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new GenerationProviderError("generation.provider_invalid_response");
  }
  return value;
}

function requireUsage(value: unknown): GenerationUsage | undefined {
  if (value === undefined) return undefined;
  const usage = requireRecord(value);
  return Object.freeze({
    inputTokens: requireUsageCounter(usage.input_tokens),
    outputTokens: requireUsageCounter(usage.output_tokens),
    totalTokens: requireUsageCounter(usage.total_tokens),
  });
}

function requireOutputText(response: UnknownRecord): string {
  if (typeof response.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }
  throw new GenerationProviderError("generation.provider_invalid_response");
}

function safeFailureCode(status: number): string {
  if (status === 401 || status === 403) return "generation.provider_authentication_failed";
  if (status === 429) return "generation.provider_rate_limited";
  if (status >= 500 && status <= 599) return "generation.provider_unavailable";
  return "generation.provider_rejected";
}

function requireApiKey(value: string): string {
  const key = value.trim();
  if (key.length < 20) throw new Error("OpenAI API key is invalid");
  return key;
}

function requireModel(value: string): string {
  const model = value.trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(model)) throw new Error("OpenAI model is invalid");
  return model;
}

function createInput(brief: StrongrDailyAudioReflectionV2Brief): string {
  return [
    "Create a first-draft Strongr Daily audio reflection. It remains a draft only.",
    "Do not approve, publish, or claim that the human Scripture and theological reviews occurred.",
    "Return only the requested structured content. Respect prohibited wording exactly.",
    "Brief:",
    JSON.stringify(brief),
  ].join("\n");
}

export function createOpenAiStrongrDailyV2Adapter(
  options: OpenAiStrongrDailyV2AdapterOptions,
): GenerationAdapter {
  const apiKey = requireApiKey(options.apiKey);
  const model = requireModel(options.model);
  const fetch: OpenAiFetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  return Object.freeze({
    identity: Object.freeze({ model, provider }),
    async generate(request: GenerationRequest): Promise<GenerationResult> {
      if (request.brief.schema_id !== "strongr.strongr_daily_audio_reflection_brief.v2") {
        throw new GenerationProviderError("generation.provider_unsupported_brief");
      }
      let response: OpenAiResponse;
      try {
        response = await fetch(endpoint, {
          body: JSON.stringify({
            input: createInput(request.brief),
            model,
            text: {
              format: {
                name: "strongr_daily_audio_reflection_v2",
                schema: responseSchema,
                strict: true,
                type: "json_schema",
              },
            },
          }),
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          method: "POST",
        });
      } catch {
        throw new GenerationProviderError("generation.provider_unavailable");
      }
      if (!response.ok) throw new GenerationProviderError(safeFailureCode(response.status));

      let body: UnknownRecord;
      try {
        body = requireRecord(await response.json());
      } catch (error) {
        if (error instanceof GenerationProviderError) throw error;
        throw new GenerationProviderError("generation.provider_invalid_response");
      }
      let output: ReturnType<typeof parseStrongrDailyAudioReflectionV2>;
      try {
        const candidate = JSON.parse(requireOutputText(body)) as Record<string, unknown>;
        const contentHash = createGenerationOutputHash({
          ...candidate,
          content_hash: "0".repeat(64),
        } as ReturnType<typeof parseStrongrDailyAudioReflectionV2>);
        output = parseStrongrDailyAudioReflectionV2({ ...candidate, content_hash: contentHash });
      } catch {
        throw new GenerationProviderError("generation.provider_invalid_response");
      }
      const usage = requireUsage(body.usage);
      return Object.freeze({
        model,
        output,
        outputHash: createGenerationOutputHash(output),
        promptChecksum: createGenerationPromptChecksum(request.promptKey, request.promptVersion),
        provider,
        providerResponseId: requireSafeProviderId(body.id),
        responseSchemaId: strongrDailyAudioReflectionV2SchemaId,
        ...(usage ? { usage } : {}),
      });
    },
  });
}
