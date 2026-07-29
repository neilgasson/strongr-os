import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const runner = readFileSync(
  resolve(import.meta.dirname, "..", "run-strongr-daily-v2-windows.ps1"),
  "utf8",
);

test("Windows Strongr Daily v2 runner keeps credentials in memory and clears them", () => {
  assert.match(runner, /Read-Host "Supabase NEW secret key \(hidden\)" -AsSecureString/);
  assert.match(runner, /Session Pooler database URL \(hidden\)" -AsSecureString/);
  assert.match(runner, /finally \{/);
  assert.match(runner, /Remove-Item -Path "Env:\$name"/);
  assert.match(runner, /Remove-Variable -Name publishableKey, secretKey, databaseUrl/);
  assert.match(runner, /\.Dispose\(\)/);
  assert.doesNotMatch(runner, /(?:Add-Content|Out-File|Set-Content|\.env)/);
});

test("Windows Strongr Daily v2 runner validates the disposable Session Pooler and command boundary", () => {
  assert.match(runner, /guovsmbtxuowyyqamaex/);
  assert.match(runner, /\.pooler\.supabase\.com/);
  assert.match(runner, /\[YOUR-PASSWORD\]/);
  assert.match(runner, /throw "missing_node"/);
  assert.match(runner, /throw "missing_pnpm"/);
  assert.match(runner, /throw "missing_psql"/);
  assert.match(runner, /& pnpm\.cmd acceptance:strongr-daily-v2 2>&1/);
  assert.match(runner, /Write-SanitizedArtifactDiagnostic/);
});

test("Windows Strongr Daily v2 runner preserves every safe preflight stage in failure output", () => {
  for (const stage of [
    "resolve_repository_root",
    "add_postgres_to_path",
    "read_publishable_key",
    "read_secret_key",
    "read_database_url",
    "convert_secret_key",
    "convert_database_url",
    "validate_publishable_key",
    "validate_secret_key",
    "validate_database_url",
    "set_environment",
    "validate_environment",
    "find_node",
    "find_pnpm",
    "find_psql",
    "launch_acceptance_harness",
    "read_acceptance_artifact",
    "cleanup",
  ]) {
    assert.match(runner, new RegExp(`\\$preflightStage = "${stage}"`));
  }
  assert.match(runner, /diagnostic: preflight_stage_failed/);
  assert.match(runner, /preflight_stage: \$preflightStage/);
  assert.match(runner, /exception_type: \$\(\$_\.Exception\.GetType\(\)\.FullName\)/);
  assert.doesNotMatch(runner, /Exception\.Message/);
});

test("Windows Strongr Daily v2 runner captures native harness stderr without a PowerShell 5.1 terminating error", () => {
  assert.match(runner, /\$acceptanceErrorActionPreference = \$ErrorActionPreference/);
  assert.match(runner, /\$ErrorActionPreference = "Continue"/);
  assert.match(runner, /\$harnessOutput = @\(& pnpm\.cmd acceptance:strongr-daily-v2 2>&1\)/);
  assert.match(runner, /\$ErrorActionPreference = \$acceptanceErrorActionPreference/);
});
