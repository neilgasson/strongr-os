#!/usr/bin/env bash
set -euo pipefail

source_url="${STRONGR_OS_DATABASE_URL:-}"
restore_url="${STRONGR_OS_RESTORE_DATABASE_URL:-}"
work_directory="${STRONGR_OS_RESTORE_WORK_DIRECTORY:-}"
source_target="${STRONGR_OS_SOURCE_TARGET:-}"
restore_target="${STRONGR_OS_RESTORE_TARGET:-}"
source_project_ref="${STRONGR_OS_SOURCE_PROJECT_REF:-}"
restore_project_ref="${STRONGR_OS_RESTORE_PROJECT_REF:-}"

if [[ -z "$source_url" || -z "$restore_url" ]]; then
  printf '%s\n' \
    "ERROR: STRONGR_OS_DATABASE_URL and STRONGR_OS_RESTORE_DATABASE_URL are required." >&2
  exit 2
fi
if [[ "$source_url" == "$restore_url" ]]; then
  printf '%s\n' "ERROR: Source and restore URLs must be different." >&2
  exit 2
fi
if [[ "$source_target" != "strongr-os-dev" ]]; then
  printf '%s\n' \
    "ERROR: STRONGR_OS_SOURCE_TARGET must equal strongr-os-dev." >&2
  exit 2
fi
if [[ "$restore_target" != "strongr-os-disposable" ]]; then
  printf '%s\n' \
    "ERROR: STRONGR_OS_RESTORE_TARGET must equal strongr-os-disposable." >&2
  exit 2
fi
if [[ ! "$source_project_ref" =~ ^[a-z0-9]{20}$ \
   || ! "$restore_project_ref" =~ ^[a-z0-9]{20}$ ]]; then
  printf '%s\n' \
    "ERROR: Both Strongr OS project references must be 20 lowercase letters or digits." >&2
  exit 2
fi
if [[ "$source_project_ref" == "$restore_project_ref" ]]; then
  printf '%s\n' "ERROR: Source and restore project references must differ." >&2
  exit 2
fi
if [[ "${STRONGR_OS_RESTORE_CONFIRM:-}" != "strongr-os-disposable-restore" ]]; then
  printf '%s\n' \
    "ERROR: Set STRONGR_OS_RESTORE_CONFIRM=strongr-os-disposable-restore after confirming the target is disposable." >&2
  exit 2
fi
for required_command in comm diff pg_dump pg_restore psql python3 sha256sum sort wc; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    printf 'ERROR: %s is required.\n' "$required_command" >&2
    exit 2
  fi
done

python3 - \
  "$source_url" "$source_project_ref" \
  "$restore_url" "$restore_project_ref" <<'PY'
import sys
import urllib.parse


def matches(connection_string, project_ref):
    authority = connection_string.partition("://")[2].split("/", 1)[0]
    userinfo, separator, hostport = authority.rpartition("@")
    if not separator:
        return False
    hostname = hostport.split(":", 1)[0].strip("[]").lower()
    username = urllib.parse.unquote(userinfo.split(":", 1)[0])
    return (
        hostname == f"db.{project_ref}.supabase.co"
        or username.endswith(f".{project_ref}")
    )


if not matches(sys.argv[1], sys.argv[2]):
    raise SystemExit(
        "ERROR: STRONGR_OS_DATABASE_URL does not match the source project ref."
    )
if not matches(sys.argv[3], sys.argv[4]):
    raise SystemExit(
        "ERROR: STRONGR_OS_RESTORE_DATABASE_URL does not match the restore project ref."
    )
PY

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
source_tables_path="$work_directory/source-tables.txt"
restore_tables_path="$work_directory/restore-tables.txt"
source_profile_ids_path="$work_directory/source-profile-ids.txt"
restore_auth_ids_path="$work_directory/restore-auth-ids.txt"
started_epoch="$(date +%s)"

schema_query="
select format('%I', table_name)
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name
"

psql "$source_url" -X -qAt -v ON_ERROR_STOP=1 \
  -c "$schema_query" >"$source_tables_path"
psql "$restore_url" -X -qAt -v ON_ERROR_STOP=1 \
  -c "$schema_query" >"$restore_tables_path"

if ! diff -u "$source_tables_path" "$restore_tables_path" >/dev/null; then
  printf '%s\n' \
    "ERROR: Disposable target schema does not match the source public schema." >&2
  diff -u "$source_tables_path" "$restore_tables_path" >&2 || true
  exit 1
fi

required_migrations=(
  202607241230
  202607241330
  202607242230
  202607251200
  202607251230
  202607251830
)
for migration_version in "${required_migrations[@]}"; do
  applied="$(
    psql "$restore_url" -X -qAt -v ON_ERROR_STOP=1 \
      -c "select exists (
        select 1
        from supabase_migrations.schema_migrations
        where version = '$migration_version'
      )"
  )"
  if [[ "$applied" != "t" ]]; then
    printf 'ERROR: Disposable target is missing migration %s.\n' \
      "$migration_version" >&2
    exit 1
  fi
done

mapfile -t public_tables <"$source_tables_path"
if (( ${#public_tables[@]} == 0 )); then
  printf '%s\n' "ERROR: No Strongr OS public tables were found." >&2
  exit 1
fi

for table_identifier in "${public_tables[@]}"; do
  psql "$restore_url" -X -qAt -v ON_ERROR_STOP=1 \
    -c "truncate table public.$table_identifier restart identity cascade"
done

for table_identifier in "${public_tables[@]}"; do
  target_count="$(
    psql "$restore_url" -X -qAt -v ON_ERROR_STOP=1 \
      -c "select count(*) from public.$table_identifier"
  )"
  if [[ "$target_count" != "0" ]]; then
    printf 'ERROR: Disposable target table public.%s is not empty (%s rows).\n' \
      "$table_identifier" "$target_count" >&2
    exit 1
  fi
done

psql "$source_url" -X -qAt -v ON_ERROR_STOP=1 \
  -c "select id from public.profiles order by id" \
  | sort >"$source_profile_ids_path"
psql "$restore_url" -X -qAt -v ON_ERROR_STOP=1 \
  -c "select id from auth.users order by id" \
  | sort >"$restore_auth_ids_path"

missing_auth_users="$(
  comm -23 "$source_profile_ids_path" "$restore_auth_ids_path"
)"
if [[ -n "$missing_auth_users" ]]; then
  missing_count="$(printf '%s\n' "$missing_auth_users" | wc -l | tr -d ' ')"
  printf '%s\n' \
    "ERROR: The disposable target is missing $missing_count Auth user(s) referenced by Strongr OS profiles. Restore Auth through the Supabase project-backup path first; this script will not fabricate users." >&2
  exit 1
fi

psql "$restore_url" -X -qAt -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $preflight$
begin
  if to_regprocedure('public.m0_operational_health()') is null then
    raise exception 'M0.2 health function is missing before restore';
  end if;
  if to_regprocedure(
    'public.m1_approve_version(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid)'
  ) is null then
    raise exception 'governed approval command is missing before restore';
  end if;
end;
$preflight$;
SQL

pg_dump \
  "$source_url" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --data-only \
  --schema=public \
  --file="$archive_path"
sha256sum "$archive_path" >"$checksum_path"
sha256sum --check "$checksum_path" >/dev/null

pg_restore \
  --dbname="$restore_url" \
  --data-only \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$archive_path"

for table_identifier in "${public_tables[@]}"; do
  source_count="$(
    psql "$source_url" -X -qAt -v ON_ERROR_STOP=1 \
      -c "select count(*) from public.$table_identifier"
  )"
  restore_count="$(
    psql "$restore_url" -X -qAt -v ON_ERROR_STOP=1 \
      -c "select count(*) from public.$table_identifier"
  )"
  if [[ "$source_count" != "$restore_count" ]]; then
    printf 'ERROR: Row-count mismatch for %s (source=%s restore=%s).\n' \
      "$table_identifier" "$source_count" "$restore_count" >&2
    exit 1
  fi
done

psql "$restore_url" -X -qAt -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
do $integrity$
begin
  if exists (
    select 1
    from public.profiles p
    left join auth.users u on u.id = p.id
    where u.id is null
  ) then
    raise exception 'restored profile is missing its Auth user';
  end if;
end;
$integrity$;

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
  "{\"test\":\"m0_2_backup_restore\",\"status\":\"pass\",\"source_target\":\"strongr-os-dev\",\"restore_target\":\"strongr-os-disposable\",\"scope\":\"public_application_data\",\"duration_seconds\":$duration_seconds,\"archive_sha256\":\"$archive_hash\",\"verified_table_count\":${#public_tables[@]},\"auth_user_precondition\":\"pass\"}"
