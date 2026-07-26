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

export function createGenerationPromptChecksum(promptKey: string, promptVersion: number): string {
  return createHash("sha256").update(`${promptKey}:${promptVersion}`, "utf8").digest("hex");
}
