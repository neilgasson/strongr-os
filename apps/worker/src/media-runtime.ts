import { deterministicMediaAdapter, type MediaAdapter } from "../../../packages/media/src/index.ts";

import type { WorkerEnvironment } from "./environment.ts";
import {
  DurableMediaWorker,
  type DurableMediaWorkerSummary,
  type MediaWorkerEvidenceSink,
} from "./media-worker.ts";
import { SupabaseMediaWorkerStore } from "./supabase-media-worker-store.ts";
import { SupabaseRpcClient, type RpcFetch } from "./supabase-rpc.ts";
import { SupabasePrivateMediaStorage, type StorageFetch } from "./supabase-storage.ts";

export interface DurableMediaWorkerRuntime {
  readonly worker: DurableMediaWorker;
  runOnce(options?: {
    readonly batchSize?: number;
    readonly leaseSeconds?: number;
    readonly retryAfterSeconds?: number;
  }): Promise<DurableMediaWorkerSummary>;
}

export function createDurableMediaWorkerRuntime(
  environment: WorkerEnvironment,
  options: {
    readonly adapter?: MediaAdapter;
    readonly clock?: () => number;
    readonly evidence?: MediaWorkerEvidenceSink;
    readonly rpcFetch?: RpcFetch;
    readonly storageFetch?: StorageFetch;
  } = {},
): DurableMediaWorkerRuntime {
  const rpc = new SupabaseRpcClient(environment, options.rpcFetch);
  const store = new SupabaseMediaWorkerStore(rpc);
  const storage = new SupabasePrivateMediaStorage(environment, options.storageFetch);
  const worker = new DurableMediaWorker({
    adapter: options.adapter ?? deterministicMediaAdapter,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.evidence ? { evidence: options.evidence } : {}),
    storage,
    store,
    workerId: environment.workerId,
  });
  return Object.freeze({
    worker,
    runOnce(runOptions = {}) {
      return worker.runOnce(runOptions);
    },
  });
}
