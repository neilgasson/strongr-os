import type { JsonValue } from "../../../packages/contracts/src/index.ts";

import type { WorkerEnvironment } from "./environment.ts";

export type RpcFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class SupabaseRpcError extends Error {
  readonly databaseCode: string | null;
  readonly rpcName: string;
  readonly status: number;

  constructor(rpcName: string, status: number, databaseCode: string | null) {
    super(`Supabase RPC ${rpcName} failed with HTTP ${status}`);
    this.name = "SupabaseRpcError";
    this.rpcName = rpcName;
    this.status = status;
    this.databaseCode = databaseCode;
  }
}

function safeDatabaseCode(value: unknown): string | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    /^[A-Z0-9]{5}$/.test(value.code)
  ) {
    return value.code;
  }
  return null;
}

export class SupabaseRpcClient {
  readonly #fetch: RpcFetch;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #supabaseUrl: string;

  constructor(environment: WorkerEnvironment, fetchImplementation: RpcFetch = fetch) {
    this.#fetch = fetchImplementation;
    this.#supabaseUrl = environment.supabaseUrl;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      apikey: environment.supabasePrivilegedKey,
    };
    if (environment.privilegedKeyKind === "legacy_service_role") {
      headers.Authorization = `Bearer ${environment.supabasePrivilegedKey}`;
    }
    this.#headers = Object.freeze(headers);
  }

  async rpc<Result>(
    rpcName: string,
    arguments_: Readonly<Record<string, JsonValue>>,
  ): Promise<Result> {
    const response = await this.#fetch(
      `${this.#supabaseUrl}/rest/v1/rpc/${encodeURIComponent(rpcName)}`,
      {
        body: JSON.stringify(arguments_),
        headers: this.#headers,
        method: "POST",
      },
    );

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = null;
      }
      throw new SupabaseRpcError(rpcName, response.status, safeDatabaseCode(errorBody));
    }
    if (response.status === 204) {
      return undefined as Result;
    }
    return (await response.json()) as Result;
  }
}
