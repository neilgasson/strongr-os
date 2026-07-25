#!/usr/bin/env bash
set -euo pipefail

source_url="${STRONGR_OS_DATABASE_URL:-}"
restore_url="${STRONGR_OS_RESTORE_DATABASE_URL:-}"
work_directory="${STRONGR_OS_RESTORE_WORK_DIRECTORY:-}"

if [[ -z "$source_url" || -z "$restore_url" ]]; then
  printf '%s\n' \
    "ERROR: STRONGR_OS_DATABASE_URL and STRONGR_OS_RESTORE_DATABASE_URL are required." >&2
  exit 2
fi
if [[ "$source_url" == "$restore_url" ]]; then
  printf '%s\n' "ERROR: Source and restore URLs must be different." >&2
  exit 2
fi
if [[ "${STRONGR_OS_RESTORE_CONFIRM:-}" != "strongr-os-disposable-restore" ]]; then
  printf '%s\n' \
    "ERROR: Set STRONGR_OS_RESTORE_CONFIRM=strongr-os-disposable-restore after confirming the target is disposable." >&2
  exit 2
fi
for required_command in pg_dump pg_restore psql sha256sum; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'ERROR: %s is required.\n' "$required_command" >&2
    exit 2
  fi
done

if [[ -z "$work_directory" ]]; then
  work_directory="$(mktemp -d -t strongr-os-restore-drill.XXXXXX)"
  remove_work_directory=1
else
  mkdir -p "$work_directory"
  remove_work_directory=0
fi

cleanup() {
  if (( remove_work_directory == 1 )); then
    rm -rf -- "$work_directory"
  fi
}
trap cleanup EXIT

umask 077
archive_path="$work_directory/strongr-os-restore-drill.dump"
checksum_path="$archive_path.sha256"
started_epoch="$(date +%s)"

pg_dump \
  "$source_url" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --schema=public \
  --schema=supabase_migrations \
  --file="$archive_path"
sha256sum "$archive_path" >"$checksum_path"
sha256sum --check "$checksum_path" >/dev/null

pg_restore \
  --dbname="$restore_url" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$archive_path"

critical_tables=(
  organizations
  memberships
  content_items
  content_versions
  approval_snapshots
  audit_events
  outbox_events
  outbox_delivery_receipts
)

for table_name in "${critical_tables[@]}"; do
  source_count="$(
    psql "$source_url" -X -qAt -v ON_ERROR_STOP=1 \
      -c "select count(*) from public.$table_name"
  )"
  restore_count="$(
    psql "$restore_url" -X -qAt -v ON_ERROR_STOP=1 \
      -c "select count(*) from public.$table_name"
  )"
  if [[ "$source_count" != "$restore_count" ]]; then
    printf 'ERROR: Row-count mismatch for %s (source=%s restore=%s).\n' \
      "$table_name" "$source_count" "$restore_count" >&2
    exit 1
  fi
done

psql "$restore_url" -X -qAt -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $verify$
begin
  if to_regprocedure('public.m0_operational_health()') is null then
    raise exception 'M0.2 health function is missing after restore';
  end if;
  if to_regprocedure(
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)'
  ) is null then
    raise exception 'governed approval command is missing after restore';
  end if;
end;
$verify$;

select public.m0_operational_health();
SQL

finished_epoch="$(date +%s)"
duration_seconds="$((finished_epoch - started_epoch))"
archive_hash="$(cut -d ' ' -f 1 "$checksum_path")"

printf '%s\n' \
  "{\"test\":\"m0_2_backup_restore\",\"status\":\"pass\",\"duration_seconds\":$duration_seconds,\"archive_sha256\":\"$archive_hash\",\"critical_table_count\":${#critical_tables[@]}}"
