import { mediaStorageContract } from "../../contracts/src/index.ts";
import { createSyntheticPcmWav } from "../../media/src/index.ts";

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
  return createSyntheticPcmWav();
}
