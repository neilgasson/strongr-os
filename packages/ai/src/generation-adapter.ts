import { createHash } from "node:crypto";

import type { Uuid } from "../../contracts/src/index.ts";
import type { AudioReflection, AudioReflectionBrief } from "../../content-schemas/src/index.ts";

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
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  throw new Error("Canonical JSON supports JSON values only");
}

export function createGenerationPromptChecksum(promptKey: string, promptVersion: number): string {
  return createHash("sha256").update(`${promptKey}:${promptVersion}`, "utf8").digest("hex");
}

export function createGenerationOutputHash(output: AudioReflection): string {
  return createHash("sha256").update(canonicalJson(output), "utf8").digest("hex");
}
