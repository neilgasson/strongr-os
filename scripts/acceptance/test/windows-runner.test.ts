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

test("Windows Strongr Daily v2 runner emits only allow-listed preflight diagnostics", () => {
  for (const reason of [
    "invalid_publishable_key",
    "invalid_secret_key",
    "invalid_session_pooler_database_url",
    "missing_required_environment",
    "missing_node",
    "missing_pnpm",
    "missing_psql",
    "repository_root_not_found",
    "unknown_preflight_failure",
  ]) {
    assert.match(runner, new RegExp(reason));
  }
  assert.match(runner, /Get-SafePreflightReason -Reason \$_\.Exception\.Message/);
  assert.doesNotMatch(runner, /acceptance_runner_preflight_failed/);
});
