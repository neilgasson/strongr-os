import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const workflow = readFileSync(
  resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    ".github",
    "workflows",
    "strongr-daily-v2-disposable-acceptance.yml",
  ),
  "utf8",
);
const acceptanceHarness = readFileSync(
  resolve(import.meta.dirname, "..", "run_strongr_daily_v2_supabase_acceptance.ts"),
  "utf8",
);

test("Strongr Daily v2 disposable workflow is manually dispatched and target-locked", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:\s+branches:\s+- agent\/verify-strongr-daily-owner-slice/);
  assert.match(workflow, /environment: strongr-os-disposable/);
  assert.match(workflow, /STRONGR_OS_M1_ACCEPTANCE_TARGET: strongr-os-disposable/);
  assert.match(workflow, /STRONGR_OS_PROJECT_REF: guovsmbtxuowyyqamaex/);
  assert.match(workflow, /STRONGR_OS_SUPABASE_URL: https:\/\/guovsmbtxuowyyqamaex\.supabase\.co/);
  assert.doesNotMatch(workflow, /strongr-os-dev/);
});

test("Strongr Daily v2 disposable workflow keeps credentials in environment secrets", () => {
  for (const secret of [
    "STRONGR_DAILY_V2_SUPABASE_PUBLISHABLE_KEY",
    "STRONGR_DAILY_V2_SUPABASE_SECRET_KEY",
    "STRONGR_DAILY_V2_DATABASE_PASSWORD",
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`));
  }
  assert.match(workflow, /encodeURIComponent\(password\)/);
  assert.match(workflow, />>"\$GITHUB_ENV"/);
  assert.match(workflow, /secret_names/);
  assert.match(workflow, /\$\{secret_names\[\$name\]\} is missing/);
  assert.doesNotMatch(workflow, /(?:printenv|env\s*$|set\s*$|tee)/m);
  assert.doesNotMatch(workflow, /STRONGR_OS_DATABASE_URL: \$\{\{ secrets\./);
});

test("Strongr Daily v2 disposable workflow always preserves evidence", () => {
  assert.match(workflow, /artifacts\/acceptance\/workflow\.jsonl/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /pnpm acceptance:strongr-daily-v2/);
  assert.match(workflow, /path: artifacts\/acceptance/);
});

test("Phase 4B.1 remote acceptance is persistent-state-free and fail-closed", () => {
  const runAcceptance = acceptanceHarness.slice(
    acceptanceHarness.indexOf("async function runAcceptance"),
    acceptanceHarness.indexOf("function writeArtifact"),
  );

  assert.match(runAcceptance, /v2_content_profile_registry_is_empty/);
  assert.match(runAcceptance, /v2_no_content_profile_is_active/);
  assert.match(runAcceptance, /v2_brief_requires_exact_registered_content_profile/);
  assert.match(runAcceptance, /v2_live_provider_request_requires_active_profile/);
  assert.match(runAcceptance, /provider_call_count:\s*0/);
  assert.doesNotMatch(
    acceptanceHarness,
    /(?:insert into|delete from) app_private\.strongr_daily_content_profiles/i,
  );
  assert.doesNotMatch(runAcceptance, /\b(?:claimGeneration|completeGeneration)\s*\(/);
});
