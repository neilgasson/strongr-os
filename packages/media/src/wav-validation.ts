import { createHash } from "node:crypto";

import { mediaStorageContract } from "../../contracts/src/index.ts";

export interface PcmWavOutputSpec {
  readonly bitsPerSample: 16;
  readonly channels: 1;
  readonly codec: "pcm_s16le";
  readonly container: "wav";
  readonly maxBytes: number;
  readonly maxDurationMs: number;
  readonly mimeType: "audio/wav";
  readonly sampleRateHz: 16_000;
}

export interface ValidatedPcmWav {
  readonly bitsPerSample: 16;
  readonly byteCount: number;
  readonly channels: 1;
  readonly codec: "pcm_s16le";
  readonly container: "wav";
  readonly durationMs: number;
  readonly mimeType: "audio/wav";
  readonly sampleRateHz: 16_000;
  readonly sha256: string;
  readonly validationSchemaId: "strongr.media_validation.v1";
}

export class MediaValidationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "MediaValidationError";
    this.code = code;
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return Buffer.from(bytes.subarray(offset, offset + length)).toString("ascii");
}

function fail(code: string): never {
  throw new MediaValidationError(code);
}

export function validatePcmWav(bytes: Uint8Array, spec: PcmWavOutputSpec): ValidatedPcmWav {
  if (!(bytes instanceof Uint8Array)) {
    return fail("media.bytes_invalid");
  }
  if (bytes.byteLength < 44 || bytes.byteLength > spec.maxBytes) {
    return fail("media.byte_count_invalid");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WAVE" ||
    ascii(bytes, 12, 4) !== "fmt " ||
    ascii(bytes, 36, 4) !== "data"
  ) {
    return fail("media.wav_structure_invalid");
  }

  const riffSize = view.getUint32(4, true);
  const formatChunkSize = view.getUint32(16, true);
  const audioFormat = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const sampleRateHz = view.getUint32(24, true);
  const byteRate = view.getUint32(28, true);
  const blockAlign = view.getUint16(32, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);

  if (
    riffSize !== bytes.byteLength - 8 ||
    formatChunkSize !== 16 ||
    audioFormat !== 1 ||
    dataBytes !== bytes.byteLength - 44
  ) {
    return fail("media.wav_structure_invalid");
  }
  if (
    channels !== spec.channels ||
    sampleRateHz !== spec.sampleRateHz ||
    bitsPerSample !== spec.bitsPerSample ||
    blockAlign !== spec.channels * (spec.bitsPerSample / 8) ||
    byteRate !== spec.sampleRateHz * blockAlign
  ) {
    return fail("media.wav_spec_mismatch");
  }
  if (dataBytes === 0 || dataBytes % blockAlign !== 0) {
    return fail("media.wav_data_invalid");
  }

  const durationMs = (dataBytes * 1_000) / byteRate;
  if (!Number.isInteger(durationMs) || durationMs < 1 || durationMs > spec.maxDurationMs) {
    return fail("media.duration_invalid");
  }

  return Object.freeze({
    bitsPerSample: 16,
    byteCount: bytes.byteLength,
    channels: 1,
    codec: "pcm_s16le",
    container: "wav",
    durationMs,
    mimeType: "audio/wav",
    sampleRateHz: 16_000,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    validationSchemaId: "strongr.media_validation.v1",
  });
}

export const syntheticAudioOutputSpec: PcmWavOutputSpec = Object.freeze({
  bitsPerSample: 16,
  channels: 1,
  codec: "pcm_s16le",
  container: "wav",
  maxBytes: mediaStorageContract.maxBytes,
  maxDurationMs: 900_000,
  mimeType: "audio/wav",
  sampleRateHz: 16_000,
});
