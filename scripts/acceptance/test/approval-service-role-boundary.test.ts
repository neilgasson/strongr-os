import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "supabase",
    "migrations",
    "20260729194500_revoke_service_role_approval.sql",
  ),
  "utf8",
);

test("service_role cannot execute the governed approval command", () => {
  assert.match(migration, /revoke execute on function public\.m1_approve_version\([\s\S]*?\) from service_role;/);
  assert.match(migration, /approval security verification failed: service_role can execute/);
  assert.match(migration, /authenticated cannot execute/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*?m1_approve_version[\s\S]*?service_role/i);
});
