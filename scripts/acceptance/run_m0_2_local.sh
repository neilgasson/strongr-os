#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' "ERROR: Docker is required for the isolated Supabase gate." >&2
  exit 2
fi
if ! docker info >/dev/null 2>&1; then
  printf '%s\n' "ERROR: Docker is installed but not running." >&2
  exit 2
fi
for required_command in npx psql python3; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'ERROR: %s is required.\n' "$required_command" >&2
    exit 2
  fi
done

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
commit_sha="$(git rev-parse HEAD)"
evidence_directory="${M0_2_EVIDENCE_DIRECTORY:-artifacts/m0-2-local-$timestamp}"
database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

mkdir -p "$evidence_directory"

stop_supabase() {
  npx --yes supabase@2.109.1 stop --no-backup >/dev/null 2>&1 || true
}
trap stop_supabase EXIT

scripts/acceptance/validate_repository.sh \
  | tee "$evidence_directory/static-validation.jsonl"

npx --yes supabase@2.109.1 start 2>&1 \
  | tee "$evidence_directory/supabase-start.log"
npx --yes supabase@2.109.1 db reset --local 2>&1 \
  | tee "$evidence_directory/database-reset.log"
npx --yes supabase@2.109.1 test db 2>&1 \
  | tee "$evidence_directory/database-contracts.log"

STRONGR_OS_DATABASE_URL="$database_url" \
  scripts/acceptance/run_m0_2_concurrency.sh \
  | tee "$evidence_directory/concurrent-idempotency.jsonl"

STRONGR_OS_DATABASE_URL="$database_url" \
  scripts/acceptance/rehearse_migration_failure.sh \
  | tee "$evidence_directory/migration-rehearsal.jsonl"

STRONGR_OS_DATABASE_URL="$database_url" \
  scripts/acceptance/rehearse_forward_repairs.sh \
  | tee "$evidence_directory/forward-repair-replay.jsonl"

STRONGR_OS_DATABASE_URL="$database_url" \
  scripts/ops/check_m0_2_health.sh \
  | tee "$evidence_directory/health.jsonl"

STRONGR_OS_DATABASE_URL="$database_url" \
  scripts/ops/export_m0_2_metrics.sh \
  >"$evidence_directory/metrics.prom"

find "$evidence_directory" -type f -print0 \
  | sort -z \
  | xargs -0 sha256sum \
  >"$evidence_directory/SHA256SUMS"

printf '%s\n' \
  "{\"test\":\"strongr_os_m0_2_local_gate\",\"status\":\"pass\",\"commit\":\"$commit_sha\",\"completed_at_utc\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"evidence_directory\":\"$evidence_directory\"}" \
  | tee "$evidence_directory/summary.jsonl"
