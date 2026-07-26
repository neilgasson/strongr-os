import {
  deterministicGenerationAdapter,
  type GenerationAdapter,
} from "../../../packages/ai/src/index.ts";

import {
  DurableGenerationWorker,
  type DurableWorkerBatchSummary,
  type DurableWorkerOptions,
  type WorkerEvidenceSink,
} from "./durable-worker.ts";
import type { WorkerEnvironment } from "./environment.ts";
import { SupabaseRpcClient, type RpcFetch } from "./supabase-rpc.ts";
import { SupabaseGenerationWorkerStore } from "./supabase-worker-store.ts";

export interface DurableWorkerRuntime {
  readonly worker: DurableGenerationWorker;
  runOnce(options?: DurableWorkerOptions): Promise<DurableWorkerBatchSummary>;
}

export function createDurableWorkerRuntime(
  environment: WorkerEnvironment,
  options: {
    readonly adapter?: GenerationAdapter;
    readonly clock?: () => number;
    readonly evidence?: WorkerEvidenceSink;
    readonly fetch?: RpcFetch;
  } = {},
): DurableWorkerRuntime {
  const rpc = new SupabaseRpcClient(environment, options.fetch);
  const store = new SupabaseGenerationWorkerStore(rpc);
  const worker = new DurableGenerationWorker({
    adapter: options.adapter ?? deterministicGenerationAdapter,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.evidence ? { evidence: options.evidence } : {}),
    store,
    workerId: environment.workerId,
  });

  return Object.freeze({
    worker,
    runOnce(runOptions: DurableWorkerOptions = {}) {
      return worker.runOnce(runOptions);
    },
  });
}
