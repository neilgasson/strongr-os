import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type {
  AudioReflection,
  AudioReflectionBrief,
  StrongrDailyAudioReflectionV2,
  StrongrDailyAudioReflectionV2Brief,
} from "../../content-schemas/src/index.ts";
import type { Uuid } from "../../contracts/src/index.ts";

export type GenerationBrief = AudioReflectionBrief | StrongrDailyAudioReflectionV2Brief;
export type GenerationOutput = AudioReflection | StrongrDailyAudioReflectionV2;
export type GenerationSchemaId =
  | "strongr.audio_reflection.v1"
  | "strongr.strongr_daily_audio_reflection.v2";

export interface GenerationAdapterIdentity {
  readonly provider: string;
  readonly model: string;
}

export interface GenerationRequest {
  readonly organizationId: Uuid;
  readonly generationJobId: Uuid;
  readonly correlationId: Uuid;
  readonly promptKey: string;
  readonly promptVersion: number;
  readonly brief: GenerationBrief;
}

export interface GenerationUsage {
  readonly estimatedCostMicrounits: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface GenerationResult {
  readonly provider: string;
  readonly model: string;
  readonly providerResponseId: string;
  readonly promptChecksum: string;
  readonly responseSchemaId: GenerationSchemaId;
  readonly outputHash: string;
  readonly output: GenerationOutput;
  readonly usage?: GenerationUsage;
}

export interface GenerationAdapter {
  readonly identity: GenerationAdapterIdentity;
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

export class GenerationProviderError extends Error {
  readonly safeCode: string;

  constructor(safeCode: string) {
    super(safeCode);
    this.name = "GenerationProviderError";
    this.safeCode = safeCode;
  }
}

export function isGenerationOutputBoundToBrief(
  brief: GenerationBrief,
  output: GenerationOutput,
): boolean {
  if (brief.schema_id !== "strongr.strongr_daily_audio_reflection_brief.v2") {
    return output.schema_id === "strongr.audio_reflection.v1";
  }
  if (output.schema_id !== "strongr.strongr_daily_audio_reflection.v2") {
    return false;
  }
  return (
    output.content_type === brief.content_type &&
    output.source_brief_identifier === brief.source_brief_identifier &&
    output.audience === brief.audience &&
    output.pastoral_purpose === brief.pastoral_purpose &&
    output.tone === brief.tone &&
    JSON.stringify(output.scripture_reference) === JSON.stringify(brief.scripture_reference) &&
    JSON.stringify(output.prohibited_claims_or_wording) ===
      JSON.stringify(brief.prohibited_claims_or_wording)
  );
}

function postgresJsonbText(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("PostgreSQL JSON does not support non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => postgresJsonbText(item)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => {
      const lengthDifference = Buffer.byteLength(left, "utf8") - Buffer.byteLength(right, "utf8");
      return lengthDifference || Buffer.from(left).compare(Buffer.from(right));
    });
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}: ${postgresJsonbText(item)}`)
      .join(", ")}}`;
  }
  throw new Error("PostgreSQL JSON supports JSON values only");
}

export function createGenerationPromptChecksum(promptKey: string, promptVersion: number): string {
  return createHash("sha256").update(`${promptKey}:${promptVersion}`, "utf8").digest("hex");
}

export function createGenerationOutputHash(output: GenerationOutput): string {
  // A v2 payload carries a portable content hash. Excluding that one field avoids
  // a self-referential hash while the database still hashes the complete payload.
  if (output.schema_id === "strongr.strongr_daily_audio_reflection.v2") {
    const { content_hash: _contentHash, ...content } = output;
    return createHash("sha256").update(postgresJsonbText(content), "utf8").digest("hex");
  }
  return createHash("sha256").update(postgresJsonbText(output), "utf8").digest("hex");
}
