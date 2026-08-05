import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const migration = readFileSync(
  resolve(
    repositoryRoot,
    "supabase",
    "migrations",
    "20260805050134_20260804143000_strongr_daily_native_delivery_contract.sql",
  ),
  "utf8",
);
const config = readFileSync(resolve(repositoryRoot, "supabase", "config.toml"), "utf8");
const correction = readFileSync(
  resolve(
    repositoryRoot,
    "supabase",
    "migrations",
    "20260805051456_20260805060000_strongr_daily_native_delivery_bucket_and_rls_initplan.sql",
  ),
  "utf8",
);

test("the Native delivery contract stays customer-safe and development-only", () => {
  assert.match(migration, /create table public\.strongr_daily_native_content_v1/i);
  assert.match(migration, /force row level security/i);
  assert.match(
    migration,
    /revoke all on public\.strongr_daily_native_content_v1 from anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant select on public\.strongr_daily_native_content_v1 to authenticated/i,
  );
  assert.match(migration, /auth\.jwt\(\) -> 'app_metadata' -> 'strongr_daily_development_reader'/i);
  assert.match(migration, /qual not like '%user_metadata%'/i);
  assert.doesNotMatch(migration, /insert into public\.strongr_daily_native_content_v1/i);
  assert.match(migration, /does not touch strongr-os-media/i);
});

test("the private development audio bucket is non-public and public signup remains disabled", () => {
  assert.match(
    config,
    /\[storage\.buckets\.strongr-daily-development-audio\][\s\S]*?public\s*=\s*false[\s\S]*?allowed_mime_types\s*=\s*\["audio\/wav"\]/,
  );
  assert.match(config, /\[auth\][\s\S]*?enable_signup\s*=\s*false/);
  assert.match(correction, /insert into storage\.buckets/i);
  assert.match(correction, /'strongr-daily-development-audio'/i);
  assert.match(correction, /false,\s*26214400,\s*array\['audio\/wav'\]::text\[\]/i);
  assert.match(correction, /on conflict \(id\) do nothing/i);
  assert.match(correction, /\(select auth\.jwt\(\)\)/i);
  assert.match(correction, /leaves strongr-os-media untouched/i);
});
