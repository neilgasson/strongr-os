import { createHash } from "node:crypto";

import type { Uuid } from "../../contracts/src/index.ts";
import type { AudioReflection, AudioReflectionBrief, StrongrDailyAudioReflectionV2 } from "../../content-schemas/src/index.ts";

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
  readonly brief: AudioReflectionBrief;
}

export interface GenerationResult {
  readonly provider: string;
  readonly model: string;
  readonly providerResponseId: string;
  readonly promptChecksum: string;
  readonly responseSchemaId: "strongr.audio_reflection.v1";
  readonly outputHash: string;
  readonly output: AudioReflection;
}

export interface GenerationAdapter {
  readonly identity: GenerationAdapterIdentity;
  generate(request: GenerationRequest): Promise<GenerationResult>;
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

export function createGenerationOutputHash(output: AudioReflection | StrongrDailyAudioReflectionV2): string {
  // A v2 payload carries a portable content hash. Excluding that one field avoids
  // a self-referential hash while the database still hashes the complete payload.
  if (output.schema_id === "strongr.strongr_daily_audio_reflection.v2") {
    const { content_hash: _contentHash, ...content } = output;
    return createHash("sha256").update(postgresJsonbText(content), "utf8").digest("hex");
  }
  return createHash("sha256").update(postgresJsonbText(output), "utf8").digest("hex");
}
