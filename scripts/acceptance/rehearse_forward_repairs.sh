#!/usr/bin/env bash
set -euo pipefail

database_url="${STRONGR_OS_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

if ! command -v psql >/dev/null 2>&1; then
  printf '%s\n' "ERROR: psql is required." >&2
  exit 2
fi
if [[ "$database_url" != *"127.0.0.1"* \
   && "$database_url" != *"localhost"* ]]; then
  printf '%s\n' \
    "ERROR: Forward-repair rehearsal is restricted to a disposable local database." >&2
  exit 2
fi

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"

psql_base=(
  psql
  "$database_url"
  -X
  -q
  -v ON_ERROR_STOP=1
)

"${psql_base[@]}" <<'SQL' >/dev/null
grant execute on function public.m1_record_check_run(
  uuid, uuid, text, text, text, jsonb, uuid
) to anon, authenticated;
SQL

read -r anon_before authenticated_before < <(
  "${psql_base[@]}" -A -t -F ' ' <<'SQL'
select
  has_function_privilege(
    'anon',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  )::text,
  has_function_privilege(
    'authenticated',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  )::text;
SQL
)

if [[ "$anon_before" != "true" || "$authenticated_before" != "true" ]]; then
  printf '%s\n' \
    "ERROR: The worker-permission discrepancy was not reproduced." >&2
  exit 1
fi

for replay_number in 1 2; do
  "${psql_base[@]}" \
    -f supabase/migrations/202607242230_m1_restrict_check_worker_execute.sql \
    >/dev/null
done

read -r anon_after authenticated_after service_after < <(
  "${psql_base[@]}" -A -t -F ' ' <<'SQL'
select
  has_function_privilege(
    'anon',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  )::text,
  has_function_privilege(
    'authenticated',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  )::text,
  has_function_privilege(
    'service_role',
    'public.m1_record_check_run(uuid,uuid,text,text,text,jsonb,uuid)',
    'EXECUTE'
  )::text;
SQL
)

if [[ "$anon_after" != "false" \
   || "$authenticated_after" != "false" \
   || "$service_after" != "true" ]]; then
  printf '%s\n' \
    "ERROR: Worker forward repair did not restore the required privileges." >&2
  exit 1
fi

for replay_number in 1 2; do
  "${psql_base[@]}" \
    -f supabase/migrations/202607251230_m0_2_request_idempotency_fingerprint.sql \
    >/dev/null
done

read -r request_anon request_authenticated fingerprint_fields < <(
  "${psql_base[@]}" -A -t -F ' ' <<'SQL'
select
  has_function_privilege(
    'anon',
    'public.m1_request_generation(uuid,uuid,text,integer,text,uuid)',
    'EXECUTE'
  )::text,
  has_function_privilege(
    'authenticated',
    'public.m1_request_generation(uuid,uuid,text,integer,text,uuid)',
    'EXECUTE'
  )::text,
  (
    select count(*)::text
    from (
      values
        ('brief_id'),
        ('brief_payload_hash'),
        ('prompt_key'),
        ('prompt_version')
    ) required(field_name)
    where position(
      required.field_name in pg_get_functiondef(
        'public.m1_request_generation(uuid,uuid,text,integer,text,uuid)'::regprocedure
      )
    ) > 0
  );
SQL
)

if [[ "$request_anon" != "false" \
   || "$request_authenticated" != "true" \
   || "$fingerprint_fields" != "4" ]]; then
  printf '%s\n' \
    "ERROR: Idempotency forward repair did not reach the verified state." >&2
  exit 1
fi

printf '%s\n' \
  '{"test":"m0_2_forward_repair_replay","status":"pass","worker_repair_replays":2,"idempotency_repair_replays":2,"anon_worker_execute":false,"authenticated_worker_execute":false,"service_role_worker_execute":true,"generation_fingerprint_fields":4}'
