#!/usr/bin/env bash
set -euo pipefail

database_url="${STRONGR_OS_DATABASE_URL:-}"
backup_directory="${STRONGR_OS_BACKUP_DIRECTORY:-}"
source_target="${STRONGR_OS_SOURCE_TARGET:-}"
source_project_ref="${STRONGR_OS_SOURCE_PROJECT_REF:-}"

if [[ -z "$database_url" ]]; then
  printf '%s\n' "ERROR: STRONGR_OS_DATABASE_URL is required." >&2
  exit 2
fi
if [[ -z "$backup_directory" ]]; then
  printf '%s\n' "ERROR: STRONGR_OS_BACKUP_DIRECTORY is required." >&2
  exit 2
fi
if [[ "$source_target" != "strongr-os-dev" ]]; then
  printf '%s\n' \
    "ERROR: STRONGR_OS_SOURCE_TARGET must equal strongr-os-dev." >&2
  exit 2
fi
if [[ ! "$source_project_ref" =~ ^[a-z0-9]{20}$ ]]; then
  printf '%s\n' \
    "ERROR: STRONGR_OS_SOURCE_PROJECT_REF must be the 20-character strongr-os-dev ref." >&2
  exit 2
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  printf '%s\n' "ERROR: pg_dump is required." >&2
  exit 2
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  printf '%s\n' "ERROR: sha256sum is required." >&2
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' "ERROR: python3 is required." >&2
  exit 2
fi

python3 - "$database_url" "$source_project_ref" <<'PY'
import sys
import urllib.parse

parsed = urllib.parse.urlsplit(sys.argv[1])
project_ref = sys.argv[2]
hostname = (parsed.hostname or "").lower()
username = urllib.parse.unquote(parsed.username or "")
if not (
    hostname == f"db.{project_ref}.supabase.co"
    or username.endswith(f".{project_ref}")
):
    raise SystemExit(
        "ERROR: STRONGR_OS_DATABASE_URL does not match the Strongr OS project ref."
    )
PY

mkdir -p "$backup_directory"
chmod 700 "$backup_directory"
umask 077

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive_path="$backup_directory/strongr-os-database-$timestamp.dump"
checksum_path="$archive_path.sha256"
metadata_path="$archive_path.metadata"

source_commit="unavailable"
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  source_commit="$(git rev-parse HEAD)"
fi

pg_dump \
  "$database_url" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --data-only \
  --schema=public \
  --file="$archive_path"

sha256sum "$archive_path" >"$checksum_path"

{
  printf 'created_at_utc=%s\n' "$timestamp"
  printf 'source_commit=%s\n' "$source_commit"
  printf 'source_target=strongr-os-dev\n'
  printf 'source_project_ref=%s\n' "$source_project_ref"
  printf 'scope=strongr_os_public_application_data\n'
  printf 'schemas=public\n'
  printf 'schema_source=repository_migrations\n'
  printf 'includes_auth_users=false\n'
  printf 'includes_storage_objects=false\n'
  printf 'full_project_backup=false\n'
  printf 'archive=%s\n' "$(basename "$archive_path")"
  printf 'sha256=%s\n' "$(cut -d ' ' -f 1 "$checksum_path")"
} >"$metadata_path"

printf '%s\n' \
  "{\"operation\":\"strongr_os_database_backup\",\"status\":\"pass\",\"source_target\":\"strongr-os-dev\",\"archive\":\"$archive_path\",\"checksum\":\"$checksum_path\",\"metadata\":\"$metadata_path\",\"source_commit\":\"$source_commit\"}"
