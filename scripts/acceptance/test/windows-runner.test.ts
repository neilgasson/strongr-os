import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const runner = readFileSync(
  resolve(import.meta.dirname, "..", "run-strongr-daily-v2-windows.ps1"),
  "utf8",
);

test("Windows Strongr Daily v2 runner keeps credentials in memory and clears them", () => {
  assert.match(runner, /Read-Host "Supabase NEW secret key \(hidden\)" -AsSecureString/);
  assert.match(runner, /Supabase disposable database password \(hidden\)" -AsSecureString/);
  assert.match(runner, /finally \{/);
  assert.match(runner, /Remove-Item -Path "Env:\$name"/);
  assert.match(
    runner,
    /Remove-Variable -Name publishableKey, secretKey, databaseUrl, databasePassword, encodedDatabasePassword/,
  );
  assert.match(runner, /\.Dispose\(\)/);
  assert.doesNotMatch(runner, /(?:Add-Content|Out-File|Set-Content|\.env)/);
});

test("Windows Strongr Daily v2 runner validates the disposable Session Pooler and command boundary", () => {
  assert.match(runner, /guovsmbtxuowyyqamaex/);
  assert.match(runner, /aws-0-ca-central-1\.pooler\.supabase\.com/);
  assert.match(runner, /postgres\.guovsmbtxuowyyqamaex/);
  assert.match(runner, /\$disposablePoolerPort = 5432/);
  assert.match(runner, /\[Uri\]::EscapeDataString\(\$databasePassword\)/);
  assert.match(runner, /throw "missing_node"/);
  assert.match(runner, /throw "missing_pnpm"/);
  assert.match(runner, /throw "missing_psql"/);
  assert.match(runner, /& pnpm\.cmd acceptance:strongr-daily-v2 2>&1/);
  assert.match(runner, /Write-SanitizedArtifactDiagnostic/);
});

test("Windows Strongr Daily v2 runner avoids the protected Windows PowerShell Host variable", () => {
  assert.match(runner, /\[string\]\$ExpectedPoolerHost/);
  assert.match(runner, /-ExpectedPoolerHost \$disposablePoolerHost/);
  assert.doesNotMatch(runner, /\[string\]\$Host/);
  assert.doesNotMatch(runner, /-Host \$disposablePoolerHost/);
});

test(
  "Windows PowerShell 5.1 can execute the Session Pooler validator without writing $Host",
  { skip: process.platform !== "win32" },
  () => {
    const runnerPath = resolve(import.meta.dirname, "..", "run-strongr-daily-v2-windows.ps1");
    const command = [
      "$ErrorActionPreference='Stop'",
      `$source=[IO.File]::ReadAllText('${runnerPath.replaceAll("'", "''")}')`,
      "$start=$source.IndexOf('function Test-SessionPoolerDatabaseUrl')",
      "$end=$source.IndexOf('function Test-DatabasePasswordAuthenticationFailure')",
      "Invoke-Expression $source.Substring($start, $end-$start)",
      "$valid=Test-SessionPoolerDatabaseUrl -Value 'postgresql://postgres.guovsmbtxuowyyqamaex:encoded@aws-0-ca-central-1.pooler.supabase.com:5432/postgres' -ExpectedPoolerHost 'aws-0-ca-central-1.pooler.supabase.com' -Port 5432 -Database 'postgres' -Username 'postgres.guovsmbtxuowyyqamaex'",
      "if (-not $valid) { exit 1 }",
    ].join("; ");

    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, result.stderr);
  },
);

test("Windows Strongr Daily v2 runner preserves every safe preflight stage in failure output", () => {
  for (const stage of [
    "resolve_repository_root",
    "add_postgres_to_path",
    "read_publishable_key",
    "read_secret_key",
    "read_database_password",
    "convert_secret_key",
    "convert_database_password",
    "construct_database_url",
    "validate_publishable_key",
    "validate_secret_key",
    "validate_database_url",
    "set_environment",
    "validate_environment",
    "find_node",
    "find_pnpm",
    "find_psql",
    "verify_database_connection",
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

test(
  "Windows Strongr Daily v2 runner constructs a percent-encoded Session Pooler URL",
  { skip: process.platform !== "win32" },
  () => {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "$password=[Uri]::EscapeDataString('p@ss word:/?'); \"postgresql://postgres.guovsmbtxuowyyqamaex:$password@aws-0-ca-central-1.pooler.supabase.com:5432/postgres\"",
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0);
    assert.equal(
      result.stdout.trim(),
      "postgresql://postgres.guovsmbtxuowyyqamaex:p%40ss%20word%3A%2F%3F@aws-0-ca-central-1.pooler.supabase.com:5432/postgres",
    );
  },
);

test("Windows Strongr Daily v2 runner emits only the safe password-authentication diagnostic", () => {
  assert.match(runner, /Test-DatabasePasswordAuthenticationFailure/);
  assert.match(runner, /password authentication failed/);
  assert.match(runner, /diagnostic: database_password_authentication_failed/);
  assert.doesNotMatch(
    runner,
    /Write-(?:Output|Host).*\$(?:databasePassword|encodedDatabasePassword|databaseUrl|secretKey)/,
  );
});

test("Windows Strongr Daily v2 runner can use disposable-only temporary access with IP and expiry restrictions", () => {
  assert.match(runner, /\[switch\]\$UseTemporaryAccess/);
  assert.match(runner, /Supabase temporary access token \(hidden\)" -AsSecureString/);
  assert.match(runner, /\$primaryUri = "\$ProjectApiUri\/jit-access"/);
  assert.match(runner, /\$legacyUri = "\$ProjectApiUri\/database\/jit-access"/);
  assert.match(runner, /Get-SupabaseTemporaryAccessConfiguration/);
  assert.match(
    runner,
    /\$temporaryAccessConfigurationUri = \[string\]\$temporaryAccessConfiguration\.Uri/,
  );
  assert.match(runner, /-Body @\{ state = "enabled" \}/);
  assert.match(runner, /role = "postgres"; rhost = \$publicIpv4/);
  assert.match(runner, /allowed_cidrs = @\(@\{ cidr = "\$publicIpv4\/32" \}\)/);
  assert.match(runner, /\[DateTimeOffset\]::UtcNow\.AddMinutes\(30\)\.ToUnixTimeMilliseconds\(\)/);
  assert.match(runner, /options=-c%20jit%3Don/);
});

test("Windows Strongr Daily v2 runner reports only safe temporary-access API and state results", () => {
  for (const result of ["unauthorized", "forbidden", "not_found", "rate_limited", "unavailable"]) {
    assert.match(runner, new RegExp(`temporaryAccessApiResult = "${result}"`));
  }
  assert.match(runner, /temporary_access_api_result: \$temporaryAccessApiResult/);
  assert.match(runner, /temporary_access_state: \$temporaryAccessStateResult/);
  assert.match(runner, /temporaryAccessStateResult = "state_missing"/);
  assert.match(runner, /function ConvertTo-SafeTemporaryAccessStateDiagnostic/);
  assert.match(runner, /\$normalized -match "\^\[a-z_\]\{1,32\}\$"/);
  assert.match(runner, /return "state_unrecognized"/);
  assert.doesNotMatch(runner, /temporary_access_api_result: \$\(\$_\.Exception/);
  assert.doesNotMatch(runner, /temporary_access_state: \$temporaryAccessToken/);
  assert.doesNotMatch(runner, /temporary_access_state: \$databaseUrl/);
});

test("Windows Strongr Daily v2 runner removes its temporary access mapping and disables only access it enabled", () => {
  assert.match(runner, /database\/jit\/\$temporaryAccessUserId/);
  assert.match(runner, /\$temporaryAccessEnabledByRunner -and \$null -ne \$temporaryAccessToken/);
  assert.match(runner, /state = "disabled"/);
  assert.match(runner, /temporary_access_mapping_cleanup_failed/);
  assert.match(runner, /temporary_access_configuration_cleanup_failed/);
  assert.doesNotMatch(
    runner,
    /Write-(?:Output|Host).*\$(?:temporaryAccessToken|temporaryAccessTokenSecure|publicIpv4|databaseUrl)/,
  );
});
