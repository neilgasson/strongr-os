#!/usr/bin/env bash
set -euo pipefail

database_url="${STRONGR_OS_DATABASE_URL:-}"
backup_directory="${STRONGR_OS_BACKUP_DIRECTORY:-}"

if [[ -z "$database_url" ]]; then
  printf '%s\n' "ERROR: STRONGR_OS_DATABASE_URL is required." >&2
  exit 2
fi
if [[ -z "$backup_directory" ]]; then
  printf '%s\n' "ERROR: STRONGR_OS_BACKUP_DIRECTORY is required." >&2
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
  --schema=public \
  --schema=supabase_migrations \
  --file="$archive_path"

sha256sum "$archive_path" >"$checksum_path"

{
  printf 'created_at_utc=%s\n' "$timestamp"
  printf 'source_commit=%s\n' "$source_commit"
  printf 'schemas=public,supabase_migrations\n'
  printf 'archive=%s\n' "$(basename "$archive_path")"
  printf 'sha256=%s\n' "$(cut -d ' ' -f 1 "$checksum_path")"
} >"$metadata_path"

printf '%s\n' \
  "{\"operation\":\"strongr_os_database_backup\",\"status\":\"pass\",\"archive\":\"$archive_path\",\"checksum\":\"$checksum_path\",\"metadata\":\"$metadata_path\",\"source_commit\":\"$source_commit\"}"
