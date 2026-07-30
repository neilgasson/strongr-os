param(
  [switch]$UseTemporaryAccess
)

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
$temporaryAccessToken = $null
$temporaryAccessTokenSecure = $null
$temporaryAccessUserId = $null
$temporaryAccessEnabledByRunner = $false
$temporaryAccessApiResult = $null
$temporaryAccessStateResult = $null
$temporaryAccessConfigurationUri = $null
$publicIpv4 = $null
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

function Invoke-SupabaseTemporaryAccessRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$AccessToken,
    [object]$Body
  )

  $script:temporaryAccessApiResult = $null
  $headers = @{ Authorization = "Bearer $AccessToken" }
  try {
    if ($null -eq $Body) {
      return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -UseBasicParsing
    }
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType "application/json" `
      -Body ($Body | ConvertTo-Json -Depth 8 -Compress) -UseBasicParsing
  } catch {
    # Platform responses can contain a request URL or user-controlled data; never display them.
    $script:temporaryAccessApiResult = "unavailable"
    try {
      $response = $_.Exception.Response
      if ($null -eq $response -and $null -ne $_.Exception.InnerException) {
        $response = $_.Exception.InnerException.Response
      }
      if ($null -ne $response) {
        switch ([int]$response.StatusCode) {
          401 { $script:temporaryAccessApiResult = "unauthorized"; break }
          403 { $script:temporaryAccessApiResult = "forbidden"; break }
          404 { $script:temporaryAccessApiResult = "not_found"; break }
          429 { $script:temporaryAccessApiResult = "rate_limited"; break }
          default { $script:temporaryAccessApiResult = "unavailable"; break }
        }
      }
    } catch {}
    throw "temporary_access_api_request_failed"
  }
}

function Get-SupabaseTemporaryAccessConfiguration {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectApiUri,
    [Parameter(Mandatory = $true)][string]$AccessToken
  )

  # Supabase's temporary-access guide still documents the legacy database/
  # route while the Management API reference documents the project route.
  # Retain only a response that implements the documented state contract. The
  # fallback is read-only; neither request changes project configuration.
  $primaryUri = "$ProjectApiUri/jit-access"
  $primary = $null
  try {
    $primary = Invoke-SupabaseTemporaryAccessRequest -Method "GET" -Uri $primaryUri -AccessToken $AccessToken
  } catch {
    if ($script:temporaryAccessApiResult -ne "not_found") { throw }
    $script:temporaryAccessApiResult = $null
  }
  if ($null -ne $primary -and $null -ne $primary.PSObject.Properties["state"] -and
      -not [string]::IsNullOrWhiteSpace([string]$primary.state)) {
    return @{ Uri = $primaryUri; Configuration = $primary }
  }

  $legacyUri = "$ProjectApiUri/database/jit-access"
  $legacy = Invoke-SupabaseTemporaryAccessRequest -Method "GET" -Uri $legacyUri -AccessToken $AccessToken
  if ($null -ne $legacy -and $null -ne $legacy.PSObject.Properties["state"] -and
      -not [string]::IsNullOrWhiteSpace([string]$legacy.state)) {
    return @{ Uri = $legacyUri; Configuration = $legacy }
  }

  $script:temporaryAccessStateResult = "state_missing"
  throw "temporary_access_state_missing"
}

function ConvertTo-SafeTemporaryAccessStateDiagnostic {
  param([object]$State)

  # State is a Supabase configuration enum. Still constrain it before output so
  # an unexpected response cannot carry a token, URL, or free-form error text.
  if ($State -isnot [string]) { return "state_unrecognized" }
  $normalized = $State.ToLowerInvariant()
  if ($normalized -match "^[a-z_]{1,32}$") { return $normalized }
  return "state_unrecognized"
}

function Resolve-PublicIpv4 {
  try {
    $response = Invoke-RestMethod -Method Get -Uri "https://api.ipify.org?format=json" -UseBasicParsing
    $address = [System.Net.IPAddress]::None
    if (-not [System.Net.IPAddress]::TryParse([string]$response.ip, [ref]$address) -or
        $address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
      throw "not_an_ipv4_address"
    }
    return $address.ToString()
  } catch {
    throw "public_ipv4_resolution_failed"
  }
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
  $preflightStage = "convert_secret_key"
  $secretKey = ConvertFrom-SecurePrompt -Value $secretKeySecure
  if ($UseTemporaryAccess) {
    $preflightStage = "read_temporary_access_token"
    $temporaryAccessTokenSecure = Read-Host "Supabase temporary access token (hidden)" -AsSecureString
    $preflightStage = "convert_temporary_access_token"
    $temporaryAccessToken = ConvertFrom-SecurePrompt -Value $temporaryAccessTokenSecure
    $preflightStage = "validate_temporary_access_token"
    if ([string]::IsNullOrWhiteSpace($temporaryAccessToken) -or -not $temporaryAccessToken.StartsWith("sbp_")) {
      throw "invalid_temporary_access_token"
    }
    $preflightStage = "resolve_public_ipv4"
    $publicIpv4 = Resolve-PublicIpv4
    $temporaryAccessApi = "https://api.supabase.com/v1/projects/$disposableProjectRef"
    $preflightStage = "inspect_temporary_access_state"
    $temporaryAccessConfiguration = Get-SupabaseTemporaryAccessConfiguration `
      -ProjectApiUri $temporaryAccessApi -AccessToken $temporaryAccessToken
    $temporaryAccessConfigurationUri = [string]$temporaryAccessConfiguration.Uri
    $temporaryAccessState = $temporaryAccessConfiguration.Configuration
    if ($temporaryAccessState.state -ne "disabled") {
      if ([string]$temporaryAccessState.state -eq "enabled") {
        $temporaryAccessStateResult = "enabled"
      } else {
        $temporaryAccessStateResult = ConvertTo-SafeTemporaryAccessStateDiagnostic -State $temporaryAccessState.state
      }
      throw "temporary_access_not_disabled"
    }
    $preflightStage = "enable_temporary_access"
    Invoke-SupabaseTemporaryAccessRequest -Method "PUT" -Uri $temporaryAccessConfigurationUri `
      -AccessToken $temporaryAccessToken -Body @{ state = "enabled" } | Out-Null
    $temporaryAccessEnabledByRunner = $true
    $preflightStage = "authorize_temporary_access_user"
    $temporaryAccessAuthorization = Invoke-SupabaseTemporaryAccessRequest -Method "POST" `
      -Uri "$temporaryAccessApi/database/jit" -AccessToken $temporaryAccessToken `
      -Body @{ role = "postgres"; rhost = $publicIpv4 }
    $temporaryAccessUserId = [string]$temporaryAccessAuthorization.user_id
    if ([string]::IsNullOrWhiteSpace($temporaryAccessUserId)) {
      throw "temporary_access_user_not_authorized"
    }
    $preflightStage = "restrict_temporary_access_user"
    $temporaryAccessExpiry = [DateTimeOffset]::UtcNow.AddMinutes(30).ToUnixTimeMilliseconds()
    Invoke-SupabaseTemporaryAccessRequest -Method "PUT" -Uri "$temporaryAccessApi/database/jit" `
      -AccessToken $temporaryAccessToken -Body @{
        user_id = $temporaryAccessUserId
        user_roles = @(@{
            role = "postgres"
            allowed_networks = @{ allowed_cidrs = @(@{ cidr = "$publicIpv4/32" }) }
            expires_at = $temporaryAccessExpiry
          })
      } | Out-Null
    $preflightStage = "construct_temporary_access_database_url"
    $databaseUrl = "postgresql://{0}:{1}@{2}:{3}/{4}?options=-c%20jit%3Don" -f `
      $disposablePoolerUsername, `
      ([Uri]::EscapeDataString($temporaryAccessToken)), `
      $disposablePoolerHost, `
      $disposablePoolerPort, `
      $disposableDatabase
  } else {
    $preflightStage = "read_database_password"
    $databasePasswordSecure = Read-Host "Supabase disposable database password (hidden)" -AsSecureString
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
  }

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
  if ($preflightStage -eq "inspect_temporary_access_state") {
    if ($null -ne $temporaryAccessApiResult) {
      Write-Output "temporary_access_api_result: $temporaryAccessApiResult"
    } elseif ($null -ne $temporaryAccessStateResult) {
      Write-Output "temporary_access_state: $temporaryAccessStateResult"
    }
  }
  Write-Output "exception_type: $($_.Exception.GetType().FullName)"
  exit 1
} finally {
  $preflightStage = "cleanup"
  if ($null -ne $temporaryAccessToken -and -not [string]::IsNullOrWhiteSpace($temporaryAccessUserId)) {
    try {
      Invoke-SupabaseTemporaryAccessRequest -Method "DELETE" `
        -Uri "https://api.supabase.com/v1/projects/$disposableProjectRef/database/jit/$temporaryAccessUserId" `
        -AccessToken $temporaryAccessToken | Out-Null
    } catch {
      Write-Output "diagnostic: temporary_access_mapping_cleanup_failed"
    }
  }
  if ($temporaryAccessEnabledByRunner -and $null -ne $temporaryAccessToken) {
    try {
      Invoke-SupabaseTemporaryAccessRequest -Method "PUT" `
        -Uri $temporaryAccessConfigurationUri `
        -AccessToken $temporaryAccessToken -Body @{ state = "disabled" } | Out-Null
    } catch {
      Write-Output "diagnostic: temporary_access_configuration_cleanup_failed"
    }
  }
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
  $temporaryAccessToken = $null
  $temporaryAccessUserId = $null
  $publicIpv4 = $null
  $secretKeySecure = $null
  $databasePasswordSecure = $null
  if ($null -ne $temporaryAccessTokenSecure) { $temporaryAccessTokenSecure.Dispose() }
  $temporaryAccessTokenSecure = $null
  $harnessOutput = $null
  $acceptanceErrorActionPreference = $null
  $databaseConnectionErrorActionPreference = $null
  $databaseConnectionOutput = $null
  $databaseConnectionExitCode = $null
  Remove-Variable -Name publishableKey, secretKey, databaseUrl, databasePassword, encodedDatabasePassword, temporaryAccessToken, temporaryAccessTokenSecure, temporaryAccessUserId, publicIpv4, secretKeySecure, databasePasswordSecure, harnessOutput, acceptanceErrorActionPreference, databaseConnectionErrorActionPreference, databaseConnectionOutput, databaseConnectionExitCode -ErrorAction SilentlyContinue
  [GC]::Collect()
  Clear-History -ErrorAction SilentlyContinue
  try { [Microsoft.PowerShell.PSConsoleReadLine]::ClearHistory() } catch {}
}
