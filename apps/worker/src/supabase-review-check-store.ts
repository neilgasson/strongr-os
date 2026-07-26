import type { RecordCheckRunArguments, Uuid } from "../../../packages/contracts/src/index.ts";
import { workerCommands } from "../../../packages/contracts/src/index.ts";

import type { AutomatedCheckStore } from "./automated-review-checks.ts";
import type { SupabaseRpcClient } from "./supabase-rpc.ts";

function requireUuid(value: unknown): Uuid {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) {
    throw new Error("Invalid record check run RPC result");
  }
  return value;
}

export class SupabaseReviewCheckStore implements AutomatedCheckStore {
  readonly #rpc: SupabaseRpcClient;

  constructor(rpc: SupabaseRpcClient) {
    this.#rpc = rpc;
  }

  async recordCheckRun(arguments_: RecordCheckRunArguments): Promise<Uuid> {
    const value = await this.#rpc.rpc<unknown>(workerCommands.recordCheckRun, {
      p_content_version_id: arguments_.contentVersionId,
      p_correlation_id: arguments_.correlationId,
      p_engine_key: arguments_.engineKey,
      p_engine_version: arguments_.engineVersion,
      p_organization_id: arguments_.organizationId,
      p_results: arguments_.results.map((result) => ({
        check_definition_id: result.checkDefinitionId,
        detail_code: result.detailCode,
        evidence: result.evidence,
        outcome: result.outcome,
      })),
      p_status: arguments_.status,
    });
    return requireUuid(value);
  }
}
