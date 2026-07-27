import type { WorkerEnvironment } from "./environment.ts";

export type StorageFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface StorageUploadResult {
  readonly disposition: "uploaded" | "conflict";
  readonly etag: string | null;
}

export type StorageDownloadResult =
  | {
      readonly disposition: "found";
      readonly bytes: Uint8Array;
      readonly etag: string | null;
    }
  | {
      readonly disposition: "not_found";
    };

export interface PrivateMediaStorage {
  download(bucketId: string, objectPath: string): Promise<StorageDownloadResult>;
  uploadWriteOnce(
    bucketId: string,
    objectPath: string,
    bytes: Uint8Array,
    mimeType: "audio/wav",
  ): Promise<StorageUploadResult>;
}

export class SupabaseStorageError extends Error {
  readonly code: "download_failed" | "upload_ambiguous" | "upload_rejected";
  readonly status: number | null;

  constructor(
    code: "download_failed" | "upload_ambiguous" | "upload_rejected",
    status: number | null,
  ) {
    super(`Supabase Storage ${code}`);
    this.name = "SupabaseStorageError";
    this.code = code;
    this.status = status;
  }
}

function encodeObjectPath(objectPath: string): string {
  if (
    !/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}[.]wav$/i.test(objectPath) ||
    objectPath.includes("..")
  ) {
    throw new Error("Invalid private media object path");
  }
  return objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isConflict(status: number, body: unknown): boolean {
  if (status === 409) {
    return true;
  }
  if (status !== 400 || typeof body !== "object" || body === null) {
    return false;
  }
  const values = Object.values(body as Record<string, unknown>)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /duplicate|already exists|resource exists/.test(values);
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class SupabasePrivateMediaStorage implements PrivateMediaStorage {
  readonly #fetch: StorageFetch;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #supabaseUrl: string;

  constructor(environment: WorkerEnvironment, fetchImplementation: StorageFetch = fetch) {
    this.#fetch = fetchImplementation;
    this.#supabaseUrl = environment.supabaseUrl;
    const headers: Record<string, string> = {
      apikey: environment.supabasePrivilegedKey,
    };
    if (environment.privilegedKeyKind === "legacy_service_role") {
      headers.Authorization = `Bearer ${environment.supabasePrivilegedKey}`;
    }
    this.#headers = Object.freeze(headers);
  }

  async uploadWriteOnce(
    bucketId: string,
    objectPath: string,
    bytes: Uint8Array,
    mimeType: "audio/wav",
  ): Promise<StorageUploadResult> {
    let response: Response;
    try {
      response = await this.#fetch(
        `${this.#supabaseUrl}/storage/v1/object/${encodeURIComponent(
          bucketId,
        )}/${encodeObjectPath(objectPath)}`,
        {
          body: Buffer.from(bytes),
          headers: {
            ...this.#headers,
            "Content-Type": mimeType,
            "x-upsert": "false",
          },
          method: "POST",
        },
      );
    } catch {
      throw new SupabaseStorageError("upload_ambiguous", null);
    }

    if (response.ok) {
      return Object.freeze({
        disposition: "uploaded",
        etag: response.headers.get("etag"),
      });
    }
    const body = await safeJson(response);
    if (isConflict(response.status, body)) {
      return Object.freeze({
        disposition: "conflict",
        etag: response.headers.get("etag"),
      });
    }
    throw new SupabaseStorageError("upload_rejected", response.status);
  }

  async download(bucketId: string, objectPath: string): Promise<StorageDownloadResult> {
    let response: Response;
    try {
      response = await this.#fetch(
        `${this.#supabaseUrl}/storage/v1/object/${encodeURIComponent(
          bucketId,
        )}/${encodeObjectPath(objectPath)}`,
        {
          headers: this.#headers,
          method: "GET",
        },
      );
    } catch {
      throw new SupabaseStorageError("download_failed", null);
    }

    if (response.status === 404) {
      return Object.freeze({ disposition: "not_found" });
    }
    if (!response.ok) {
      throw new SupabaseStorageError("download_failed", response.status);
    }
    return Object.freeze({
      bytes: new Uint8Array(await response.arrayBuffer()),
      disposition: "found",
      etag: response.headers.get("etag"),
    });
  }
}
