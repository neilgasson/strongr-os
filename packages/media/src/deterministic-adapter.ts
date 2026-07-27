import { createHash } from "node:crypto";

import type {
  MediaAdapter,
  MediaGenerationRequest,
  MediaGenerationResult,
} from "./media-adapter.ts";
import { syntheticAudioOutputSpec } from "./wav-validation.ts";

export const deterministicMediaAdapterIdentity = Object.freeze({
  adapterKey: "strongr.synthetic_audio",
  adapterVersion: "1.0.0",
});

export function createSyntheticPcmWav(): Uint8Array {
  const durationMs = 100;
  const sampleCount = (syntheticAudioOutputSpec.sampleRateHz * durationMs) / 1_000;
  const bytesPerSample = syntheticAudioOutputSpec.bitsPerSample / 8;
  const dataBytes = sampleCount * syntheticAudioOutputSpec.channels * bytesPerSample;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);

  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, syntheticAudioOutputSpec.channels, true);
  view.setUint32(24, syntheticAudioOutputSpec.sampleRateHz, true);
  view.setUint32(
    28,
    syntheticAudioOutputSpec.sampleRateHz * syntheticAudioOutputSpec.channels * bytesPerSample,
    true,
  );
  view.setUint16(32, syntheticAudioOutputSpec.channels * bytesPerSample, true);
  view.setUint16(34, syntheticAudioOutputSpec.bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

function correlationId(request: MediaGenerationRequest, bytes: Uint8Array): string {
  const digest = createHash("sha256")
    .update(request.organizationId)
    .update(request.mediaJobId)
    .update(request.productionPackageId)
    .update(request.outputSpecId)
    .update(request.inputHash)
    .update(request.correlationId)
    .update(bytes)
    .digest("hex");
  return `synthetic-${digest.slice(0, 32)}`;
}

export const deterministicMediaAdapter: MediaAdapter = Object.freeze({
  identity: deterministicMediaAdapterIdentity,
  generate(request: MediaGenerationRequest): Promise<MediaGenerationResult> {
    const bytes = createSyntheticPcmWav();
    return Promise.resolve({
      bytes,
      costMicrounits: 0,
      providerNeutralCorrelationId: correlationId(request, bytes),
    });
  },
});
