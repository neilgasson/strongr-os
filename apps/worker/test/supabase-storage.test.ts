import assert from "node:assert/strict";
import test from "node:test";

import type { WorkerEnvironment } from "../src/environment.ts";
import { SupabasePrivateMediaStorage, SupabaseStorageError } from "../src/supabase-storage.ts";

const environment: WorkerEnvironment = Object.freeze({
  privilegedKeyKind: "legacy_service_role",
  supabasePrivilegedKey: "x".repeat(40),
  supabaseUrl: "https://example.supabase.co",
  workerId: "m2-media-test",
});

const objectPath =
  "26000000-0000-4000-8000-000000000001/26000000-0000-4000-8000-000000000002/26000000-0000-4000-8000-000000000005.wav";

test("Storage upload is server-authenticated, write-once, and path scoped", async () => {
  let request: { input: string; init: RequestInit } | null = null;
  const storage = new SupabasePrivateMediaStorage(environment, (input, init = {}) => {
    request = { input: String(input), init };
    return Promise.resolve(
      new Response('{"Key":"object"}', {
        headers: { etag: '"fixture-etag"' },
        status: 200,
      }),
    );
  });

  const result = await storage.uploadWriteOnce(
    "strongr-os-media",
    objectPath,
    new Uint8Array([1, 2, 3]),
    "audio/wav",
  );

  assert.deepEqual(result, { disposition: "uploaded", etag: '"fixture-etag"' });
  assert.ok(request);
  const captured = request as { input: string; init: RequestInit };
  assert.equal(
    captured.input,
    `https://example.supabase.co/storage/v1/object/strongr-os-media/${objectPath}`,
  );
  assert.equal(captured.init.method, "POST");
  assert.equal((captured.init.headers as Record<string, string>)["x-upsert"], "false");
  assert.equal((captured.init.headers as Record<string, string>)["Content-Type"], "audio/wav");
  assert.equal(
    (captured.init.headers as Record<string, string>).Authorization,
    `Bearer ${"x".repeat(40)}`,
  );
});

test("duplicate object response becomes reconciliation instead of overwrite", async () => {
  const storage = new SupabasePrivateMediaStorage(environment, () =>
    Promise.resolve(
      new Response('{"message":"The resource already exists"}', {
        headers: { "Content-Type": "application/json" },
        status: 400,
      }),
    ),
  );

  assert.deepEqual(
    await storage.uploadWriteOnce("strongr-os-media", objectPath, new Uint8Array([1]), "audio/wav"),
    { disposition: "conflict", etag: null },
  );
});

test("ambiguous transport failure is distinguishable from a rejected upload", async () => {
  const ambiguous = new SupabasePrivateMediaStorage(environment, () =>
    Promise.reject(new Error("connection reset")),
  );
  await assert.rejects(
    ambiguous.uploadWriteOnce("strongr-os-media", objectPath, new Uint8Array([1]), "audio/wav"),
    (error: unknown) =>
      error instanceof SupabaseStorageError &&
      error.code === "upload_ambiguous" &&
      error.status === null,
  );

  const rejected = new SupabasePrivateMediaStorage(environment, () =>
    Promise.resolve(new Response("denied", { status: 403 })),
  );
  await assert.rejects(
    rejected.uploadWriteOnce("strongr-os-media", objectPath, new Uint8Array([1]), "audio/wav"),
    (error: unknown) =>
      error instanceof SupabaseStorageError &&
      error.code === "upload_rejected" &&
      error.status === 403,
  );
});

test("private download returns exact bytes or an explicit missing disposition", async () => {
  const found = new SupabasePrivateMediaStorage(environment, () =>
    Promise.resolve(
      new Response(new Uint8Array([7, 8, 9]), {
        headers: { etag: '"download-etag"' },
        status: 200,
      }),
    ),
  );
  const result = await found.download("strongr-os-media", objectPath);
  assert.equal(result.disposition, "found");
  if (result.disposition === "found") {
    assert.deepEqual(result.bytes, new Uint8Array([7, 8, 9]));
    assert.equal(result.etag, '"download-etag"');
  }

  const missing = new SupabasePrivateMediaStorage(environment, () =>
    Promise.resolve(new Response(null, { status: 404 })),
  );
  assert.deepEqual(await missing.download("strongr-os-media", objectPath), {
    disposition: "not_found",
  });
});
