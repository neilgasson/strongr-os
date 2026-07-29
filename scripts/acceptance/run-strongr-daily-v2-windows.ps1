$ErrorActionPreference = "Stop"

$requiredEnvironmentVariables = @(
  "STRONGR_OS_M1_ACCEPTANCE_TARGET",
  "STRONGR_OS_PROJECT_REF",
  "STRONGR_OS_SUPABASE_URL",
  "STRONGR_OS_SUPABASE_PUBLISHABLE_KEY",
  "STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY",
  "STRONGR_OS_DATABASE_URL"
)
$disposableProjectRef = "guovsmbtxuowyyqamaex"
$disposablePoolerHost = "aws-0-ca-central-1.pooler.supabase.com"
$disposablePoolerPort = 5432
$disposableDatabase = "postgres"
$disposablePoolerUsername = "postgres.guovsmbtxuowyyqamaex"
$artifactPath = $null
$originalPath = $env:PATH
$publishableKey = $null
$secretKey = $null
$databaseUrl = $null
$databasePassword = $null
$encodedDatabasePassword = $null
$secretKeySecure = $null
$databasePasswordSecure = $null
$preflightStage = "resolve_repository_root"
$acceptanceErrorActionPreference = $null
$databaseConnectionErrorActionPreference = $null
$databaseConnectionOutput = $null
$databaseConnectionExitCode = $null

function ConvertFrom-SecurePrompt {
  param([Parameter(Mandatory = $true)][System.Security.SecureString]$Value)

  $pointer = [IntPtr]::Zero
  try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    if ($pointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
  }
}

function Test-LegacyServiceRoleKey {
  param([Parameter(Mandatory = $true)][string]$Value)

  try {
    $parts = $Value.Split('.')
    if ($parts.Count -ne 3) { return $false }
    $payload = $parts[1].Replace('-', '+').Replace('_', '/')
    $paddingLength = (4 - ($payload.Length % 4)) % 4
    if ($paddingLength -gt 0) {
      $payload = $payload.PadRight($payload.Length + $paddingLength, '=')
    }
    $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
    return $claims.role -eq "service_role"
  } catch {
    return $false
  }
}

function Test-SessionPoolerDatabaseUrl {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$ExpectedPoolerHost,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Username
  )

  try {
    $uri = [Uri]$Value
    if ($uri.Scheme -ne "postgresql" -or $uri.Host -ne $ExpectedPoolerHost -or $uri.Port -ne $Port -or
        $uri.AbsolutePath.TrimStart('/') -ne $Database) {
      return $false
    }
    return [Uri]::UnescapeDataString($uri.UserInfo.Split(':')[0]) -eq $Username
  } catch {
    return $false
  }
}

function Test-DatabasePasswordAuthenticationFailure {
  param([Parameter(Mandatory = $true)][object[]]$Output)

  return (($Output | Out-String) -match "password authentication failed")
}

function Write-SanitizedArtifactDiagnostic {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
  $artifact = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  $failure = @($artifact.evidence | Where-Object {
      $_.test -eq "strongr_daily_v2_supabase_acceptance" -and $_.status -eq "fail"
    }) | Select-Object -Last 1
  if ($null -eq $failure) { return }

  foreach ($field in @(
    "lifecycle_step",
    "database_command",
    "postgres_code",
    "database_message",
    "database_detail",
    "database_hint",
    "error_code"
  )) {
    $value = $failure.PSObject.Properties[$field].Value
    if ($null -ne $value -and -not [string]::IsNullOrWhiteSpace([string]$value)) {
      Write-Output ("{0}: {1}" -f $field, $value)
    }
  }
}

try {
  $preflightStage = "resolve_repository_root"
  $repositoryCandidate = Join-Path $PSScriptRoot "..\.."
  if (-not (Test-Path -LiteralPath $repositoryCandidate -PathType Container)) {
    throw "repository_root_not_found"
  }
  $repositoryRoot = (Resolve-Path $repositoryCandidate).Path
  Set-Location -LiteralPath $repositoryRoot
  $artifactPath = Join-Path $repositoryRoot "artifacts\acceptance\strongr-daily-v2.json"

  $preflightStage = "add_postgres_to_path"
  $postgres17Bin = "C:\Program Files\PostgreSQL\17\bin"
  if ((Test-Path -LiteralPath (Join-Path $postgres17Bin "psql.exe") -PathType Leaf) -and
      -not (($env:PATH -split ';') -contains $postgres17Bin)) {
    $env:PATH = "$postgres17Bin;$env:PATH"
  }

  $preflightStage = "read_publishable_key"
  $publishableKey = Read-Host "Supabase publishable key"
  $preflightStage = "read_secret_key"
  $secretKeySecure = Read-Host "Supabase NEW secret key (hidden)" -AsSecureString
  $preflightStage = "read_database_password"
  $databasePasswordSecure = Read-Host "Supabase disposable database password (hidden)" -AsSecureString
  $preflightStage = "convert_secret_key"
  $secretKey = ConvertFrom-SecurePrompt -Value $secretKeySecure
  $preflightStage = "convert_database_password"
  $databasePassword = ConvertFrom-SecurePrompt -Value $databasePasswordSecure
  $preflightStage = "construct_database_url"
  $encodedDatabasePassword = [Uri]::EscapeDataString($databasePassword)
  $databaseUrl = "postgresql://{0}:{1}@{2}:{3}/{4}" -f `
    $disposablePoolerUsername, `
    $encodedDatabasePassword, `
    $disposablePoolerHost, `
    $disposablePoolerPort, `
    $disposableDatabase

  $preflightStage = "validate_publishable_key"
  if (-not $publishableKey.StartsWith("sb_publishable_")) {
    throw "invalid_publishable_key"
  }
  $preflightStage = "validate_secret_key"
  if (-not ($secretKey.StartsWith("sb_secret_") -or (Test-LegacyServiceRoleKey -Value $secretKey))) {
    throw "invalid_secret_key"
  }
  $preflightStage = "validate_database_url"
  if (-not (Test-SessionPoolerDatabaseUrl `
      -Value $databaseUrl `
      -ExpectedPoolerHost $disposablePoolerHost `
      -Port $disposablePoolerPort `
      -Database $disposableDatabase `
      -Username $disposablePoolerUsername)) {
    throw "invalid_session_pooler_database_url"
  }

  $preflightStage = "set_environment"
  $env:STRONGR_OS_M1_ACCEPTANCE_TARGET = "strongr-os-disposable"
  $env:STRONGR_OS_PROJECT_REF = $disposableProjectRef
  $env:STRONGR_OS_SUPABASE_URL = "https://$disposableProjectRef.supabase.co"
  $env:STRONGR_OS_SUPABASE_PUBLISHABLE_KEY = $publishableKey
  $env:STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY = $secretKey
  $env:STRONGR_OS_DATABASE_URL = $databaseUrl

  $preflightStage = "validate_environment"
  foreach ($name in $requiredEnvironmentVariables) {
    if ([string]::IsNullOrWhiteSpace([string](Get-Item -Path "Env:$name" -ErrorAction SilentlyContinue).Value)) {
      throw "missing_required_environment"
    }
  }
  $preflightStage = "find_node"
  if ($null -eq (Get-Command "node" -ErrorAction SilentlyContinue)) { throw "missing_node" }
  $preflightStage = "find_pnpm"
  if ($null -eq (Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue)) { throw "missing_pnpm" }
  $preflightStage = "find_psql"
  if ($null -eq (Get-Command "psql" -ErrorAction SilentlyContinue)) { throw "missing_psql" }

  $preflightStage = "verify_database_connection"
  $databaseConnectionErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $databaseConnectionOutput = @(& psql $databaseUrl -X -qAt -v "ON_ERROR_STOP=1" -c "select 1" 2>&1)
    $databaseConnectionExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $databaseConnectionErrorActionPreference
    $databaseConnectionErrorActionPreference = $null
  }
  if ($databaseConnectionExitCode -ne 0) {
    if (Test-DatabasePasswordAuthenticationFailure -Output $databaseConnectionOutput) {
      Write-Output "diagnostic: database_password_authentication_failed"
      exit 1
    }
    throw "database_connection_preflight_failed"
  }

  $preflightStage = "launch_acceptance_harness"
  $acceptanceErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $harnessOutput = @(& pnpm.cmd acceptance:strongr-daily-v2 2>&1)
    $harnessExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $acceptanceErrorActionPreference
    $acceptanceErrorActionPreference = $null
  }
  if ($harnessExitCode -eq 0) {
    Write-Output "Strongr Daily v2 acceptance: PASS"
  } else {
    Write-Output "Strongr Daily v2 acceptance: FAIL"
  }
  Write-Output "Evidence artifact: $artifactPath"
  $preflightStage = "read_acceptance_artifact"
  Write-SanitizedArtifactDiagnostic -Path $artifactPath
  if ($harnessExitCode -ne 0) { exit $harnessExitCode }
} catch {
  Write-Output "diagnostic: preflight_stage_failed"
  Write-Output "preflight_stage: $preflightStage"
  Write-Output "exception_type: $($_.Exception.GetType().FullName)"
  exit 1
} finally {
  $preflightStage = "cleanup"
  foreach ($name in $requiredEnvironmentVariables) {
    Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
  }
  $env:PATH = $originalPath
  if ($null -ne $secretKeySecure) { $secretKeySecure.Dispose() }
  if ($null -ne $databasePasswordSecure) { $databasePasswordSecure.Dispose() }
  $publishableKey = $null
  $secretKey = $null
  $databaseUrl = $null
  $databasePassword = $null
  $encodedDatabasePassword = $null
  $secretKeySecure = $null
  $databasePasswordSecure = $null
  $harnessOutput = $null
  $acceptanceErrorActionPreference = $null
  $databaseConnectionErrorActionPreference = $null
  $databaseConnectionOutput = $null
  $databaseConnectionExitCode = $null
  Remove-Variable -Name publishableKey, secretKey, databaseUrl, databasePassword, encodedDatabasePassword, secretKeySecure, databasePasswordSecure, harnessOutput, acceptanceErrorActionPreference, databaseConnectionErrorActionPreference, databaseConnectionOutput, databaseConnectionExitCode -ErrorAction SilentlyContinue
  [GC]::Collect()
  Clear-History -ErrorAction SilentlyContinue
  try { [Microsoft.PowerShell.PSConsoleReadLine]::ClearHistory() } catch {}
}
