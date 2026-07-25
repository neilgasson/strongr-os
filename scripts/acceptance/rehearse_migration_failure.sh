#!/usr/bin/env bash
set -euo pipefail

database_url="${STRONGR_OS_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

if ! command -v psql >/dev/null 2>&1; then
  printf '%s\n' "ERROR: psql is required." >&2
  exit 2
fi

if [[ "$database_url" != *"127.0.0.1"* && "$database_url" != *"localhost"* ]]; then
  if [[ "${STRONGR_OS_REMOTE_ACCEPTANCE:-}" != "strongr-os-dev" ]]; then
    printf '%s\n' \
      "ERROR: Remote execution is locked. Set STRONGR_OS_REMOTE_ACCEPTANCE=strongr-os-dev only for the isolated Strongr OS development project." >&2
    exit 2
  fi
fi

schema_suffix="$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
rehearsal_schema="m0_2_rehearsal_${schema_suffix}"

if [[ ! "$rehearsal_schema" =~ ^m0_2_rehearsal_[a-f0-9]{32}$ ]]; then
  printf '%s\n' "ERROR: Unsafe rehearsal schema name." >&2
  exit 2
fi

psql_base=(
  psql
  "$database_url"
  -X
  -q
  -v ON_ERROR_STOP=1
  -v rehearsal_schema="$rehearsal_schema"
)

cleanup() {
  "${psql_base[@]}" <<'SQL' >/dev/null 2>&1 || true
select set_config('m0_2.rehearsal_schema', :'rehearsal_schema', false);
do $cleanup$
begin
  execute format(
    'drop schema if exists %I cascade',
    current_setting('m0_2.rehearsal_schema')
  );
end;
$cleanup$;
SQL
}
trap cleanup EXIT

if "${psql_base[@]}" <<'SQL' >/dev/null 2>&1
select set_config('m0_2.rehearsal_schema', :'rehearsal_schema', false);
begin;
do $migration$
begin
  execute format(
    'create schema %I',
    current_setting('m0_2.rehearsal_schema')
  );
  execute format(
    'create table %I.partial_object (id integer primary key)',
    current_setting('m0_2.rehearsal_schema')
  );
end;
$migration$;
do $failure$
begin
  raise exception 'simulated migration failure';
end;
$failure$;
commit;
SQL
then
  printf '%s\n' "ERROR: The deliberately broken migration unexpectedly succeeded." >&2
  exit 1
fi

partial_state="$(
  "${psql_base[@]}" -A -t <<'SQL'
select case
  when to_regnamespace(:'rehearsal_schema') is null then 'rolled_back'
  else 'partial_state_present'
end;
SQL
)"

if [[ "$partial_state" != "rolled_back" ]]; then
  printf '%s\n' "ERROR: Failed migration left partial state." >&2
  exit 1
fi

"${psql_base[@]}" <<'SQL' >/dev/null
select set_config('m0_2.rehearsal_schema', :'rehearsal_schema', false);
begin;
do $repair$
begin
  execute format(
    'create schema %I',
    current_setting('m0_2.rehearsal_schema')
  );
  execute format(
    'create table %I.repaired_object (
       id integer primary key,
       repair_version text not null
     )',
    current_setting('m0_2.rehearsal_schema')
  );
  execute format(
    'insert into %I.repaired_object (id, repair_version)
     values (1, %L)',
    current_setting('m0_2.rehearsal_schema'),
    'forward-repair-v1'
  );
end;
$repair$;
commit;
SQL

repair_state="$(
  "${psql_base[@]}" -A -t <<'SQL'
select set_config('m0_2.rehearsal_schema', :'rehearsal_schema', false);
do $verify$
declare
  v_count integer;
begin
  execute format(
    'select count(*) from %I.repaired_object
     where repair_version = %L',
    current_setting('m0_2.rehearsal_schema'),
    'forward-repair-v1'
  ) into v_count;
  if v_count <> 1 then
    raise exception 'forward repair verification failed';
  end if;
end;
$verify$;
select 'repaired';
SQL
)"

repair_state="$(printf '%s\n' "$repair_state" | tail -n 1)"
if [[ "$repair_state" != "repaired" ]]; then
  printf '%s\n' "ERROR: Forward repair did not reach the verified state." >&2
  exit 1
fi

printf '%s\n' \
  "{\"test\":\"m0_2_migration_failure_forward_repair\",\"status\":\"pass\",\"failed_transaction\":\"$partial_state\",\"forward_repair\":\"$repair_state\"}"
