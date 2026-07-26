import type { GenerationAdapter } from "../../../packages/ai/src/index.ts";

import type { WorkerEnvironment } from "./environment.ts";

export interface WorkerFoundation {
  readonly environment: WorkerEnvironment;
  readonly generationAdapter: GenerationAdapter;
}

export function createWorkerFoundation(
  environment: WorkerEnvironment,
  generationAdapter: GenerationAdapter,
): WorkerFoundation {
  return Object.freeze({ environment, generationAdapter });
}
