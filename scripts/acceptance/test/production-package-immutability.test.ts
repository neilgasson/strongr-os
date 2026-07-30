import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const harness = readFileSync(
  resolve(import.meta.dirname, "..", "run_strongr_daily_v2_supabase_acceptance.ts"),
  "utf8",
);

test("production package mutation accepts the established immutable-state denial", () => {
  assert.match(
    harness,
    /const directPackageMutationDenied = await stateDenied\(\(\) =>[\s\S]*?const workerPackageMutationDenied = await stateDenied\(/,
  );
  assert.match(harness, /\["22023", "23503", "42501", "55000"\]/);
});
