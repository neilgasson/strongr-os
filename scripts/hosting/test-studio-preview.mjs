import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import worker, {
  REQUIRED_HEADERS,
  STRONGR_OS_DEV_ORIGIN,
} from "../../apps/studio/preview-worker.mjs";

const PUBLISHABLE_KEY = "sb_publishable_m3_preview_fixture";

function environment(overrides = {}) {
  return {
    ASSETS: {
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/" || path === "/index.html") {
          return new Response("<!doctype html><title>Strongr Studio</title>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 200,
          });
        }
        if (path === "/assets/app.js") {
          return new Response("export {}", {
            headers: { "Content-Type": "text/javascript; charset=utf-8" },
            status: 200,
          });
        }
        return new Response("Not found", { status: 404 });
      },
    },
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    PUBLIC_SUPABASE_URL: STRONGR_OS_DEV_ORIGIN,
    ...overrides,
  };
}

async function request(path, options = {}, overrides = {}) {
  return worker.fetch(
    new Request(`https://strongr-studio-preview.test${path}`, options),
    environment(overrides),
  );
}

function assertSecurityHeaders(response) {
  for (const [name, value] of Object.entries(REQUIRED_HEADERS)) {
    assert.equal(response.headers.get(name), value, name);
  }
}

test("worker headers exactly implement the reviewed preview contract", async () => {
  const security = JSON.parse(
    await readFile(new URL("../../apps/studio/preview-security.json", import.meta.url), "utf8"),
  );
  const expected = Object.fromEntries(
    Object.entries(security.required_headers).map(([name, value]) => [
      name,
      value.replace(`\${PUBLIC_SUPABASE_ORIGIN}`, STRONGR_OS_DEV_ORIGIN),
    ]),
  );
  assert.deepEqual(REQUIRED_HEADERS, expected);
});

test("serves the static application with the exact security headers", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assertSecurityHeaders(response);
  assert.match(await response.text(), /Strongr Studio/);
});

test("serves only the two public strongr-os-dev runtime values", async () => {
  const response = await request("/runtime-config.json");
  assert.equal(response.status, 200);
  assertSecurityHeaders(response);
  assert.deepEqual(await response.json(), {
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    PUBLIC_SUPABASE_URL: STRONGR_OS_DEV_ORIGIN,
  });
});

test("fails closed for another Supabase project or a non-publishable key", async () => {
  for (const overrides of [
    { PUBLIC_SUPABASE_URL: "https://example.supabase.co" },
    { PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden" },
  ]) {
    const response = await request("/runtime-config.json", {}, overrides);
    assert.equal(response.status, 503);
    assertSecurityHeaders(response);
    assert.deepEqual(await response.json(), { error: "Preview configuration unavailable" });
  }
});

test("uses index.html only as a navigation fallback", async () => {
  const navigation = await request("/work/brief", {
    headers: { Accept: "text/html" },
  });
  assert.equal(navigation.status, 200);
  assert.match(await navigation.text(), /Strongr Studio/);

  const missingAsset = await request("/assets/missing.js", {
    headers: { Accept: "text/javascript" },
  });
  assert.equal(missingAsset.status, 404);
});

test("redirects HTTP and rejects mutation methods", async () => {
  const insecure = await worker.fetch(
    new Request("http://strongr-studio-preview.test/work"),
    environment(),
  );
  assert.equal(insecure.status, 308);
  assert.equal(insecure.headers.get("location"), "https://strongr-studio-preview.test/work");
  assertSecurityHeaders(insecure);

  const mutation = await request("/", { method: "POST" });
  assert.equal(mutation.status, 405);
  assert.equal(mutation.headers.get("allow"), "GET, HEAD");
  assertSecurityHeaders(mutation);
});

test("the packaged Sites artifact contains the worker, assets, and hosting metadata", async () => {
  await access(new URL("../../dist/server/index.js", import.meta.url));
  await access(new URL("../../dist/client/index.html", import.meta.url));
  await access(new URL("../../dist/.openai/hosting.json", import.meta.url));

  const hostedWorker = await readFile(
    new URL("../../dist/server/index.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(hostedWorker, /service_role|sb_secret_/i);
});
