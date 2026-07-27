import { mediaStorageContract } from "../../contracts/src/index.ts";

export const mediaFixtureIds = Object.freeze({
  artifactId: "26000000-0000-4000-8000-000000000005",
  correlationId: "26000000-0000-4000-8000-000000000006",
  mediaJobId: "26000000-0000-4000-8000-000000000003",
  organizationId: "26000000-0000-4000-8000-000000000001",
  outputSpecId: "20000000-0000-4000-8000-000000000001",
  productionPackageId: "26000000-0000-4000-8000-000000000002",
  successfulAttemptId: "26000000-0000-4000-8000-000000000004",
});

export const syntheticAudioFixture = Object.freeze({
  bitsPerSample: 16 as const,
  bucketId: mediaStorageContract.bucketId,
  channels: 1 as const,
  codec: "pcm_s16le" as const,
  container: "wav" as const,
  durationMs: 100,
  mimeType: "audio/wav" as const,
  objectPath:
    "26000000-0000-4000-8000-000000000001/26000000-0000-4000-8000-000000000002/26000000-0000-4000-8000-000000000005.wav",
  sampleRateHz: 16_000 as const,
  sha256: "2976da01e205a110c9fa41d47659e238a5c6d3c3f3137582f2949853faa201dd",
});

export function createSyntheticPcmWavFixture(): Uint8Array {
  const sampleCount =
    (syntheticAudioFixture.sampleRateHz * syntheticAudioFixture.durationMs) / 1_000;
  const bytesPerSample = syntheticAudioFixture.bitsPerSample / 8;
  const dataBytes = sampleCount * syntheticAudioFixture.channels * bytesPerSample;
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
  view.setUint16(22, syntheticAudioFixture.channels, true);
  view.setUint32(24, syntheticAudioFixture.sampleRateHz, true);
  view.setUint32(
    28,
    syntheticAudioFixture.sampleRateHz * syntheticAudioFixture.channels * bytesPerSample,
    true,
  );
  view.setUint16(32, syntheticAudioFixture.channels * bytesPerSample, true);
  view.setUint16(34, syntheticAudioFixture.bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  return bytes;
}
