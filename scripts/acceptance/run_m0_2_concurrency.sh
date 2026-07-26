#!/usr/bin/env bash
set -euo pipefail

database_url="${STRONGR_OS_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
parallel_requests="${M0_2_PARALLEL_REQUESTS:-8}"

if ! command -v psql >/dev/null 2>&1; then
  printf '%s\n' "ERROR: psql is required." >&2
  exit 2
fi

if [[ ! "$parallel_requests" =~ ^[2-9][0-9]*$ ]] || (( parallel_requests > 32 )); then
  printf '%s\n' "ERROR: M0_2_PARALLEL_REQUESTS must be between 2 and 32." >&2
  exit 2
fi

if [[ "$database_url" != *"127.0.0.1"* && "$database_url" != *"localhost"* ]]; then
  printf '%s\n' \
    "ERROR: This concurrency harness is restricted to a disposable local database. Use run_remote_supabase_acceptance.py for strongr-os-dev." >&2
  exit 2
fi

new_uuid() {
  python3 -c 'import uuid; print(uuid.uuid4())'
}

organization_id="$(new_uuid)"
profile_id="$(new_uuid)"
membership_id="$(new_uuid)"
role_id="$(new_uuid)"
content_item_id="$(new_uuid)"
brief_id="$(new_uuid)"
idempotency_key="m0-2-concurrent-$(new_uuid)"
run_dir="$(mktemp -d -t strongr-os-m0-2-concurrency.XXXXXX)"

psql_base=(
  psql
  "$database_url"
  -X
  -q
  -v ON_ERROR_STOP=1
)

cleanup() {
  "${psql_base[@]}" \
    -v organization_id="$organization_id" \
    -v profile_id="$profile_id" <<'SQL' >/dev/null 2>&1 || true
select set_config('m0_2.organization_id', :'organization_id', false);
set session_replication_role = replica;

do $cleanup$
declare
  v_table record;
  v_organization_id uuid := current_setting('m0_2.organization_id')::uuid;
begin
  for v_table in
    select distinct table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'organization_id'
    order by table_name
  loop
    execute format(
      'delete from public.%I where organization_id = $1',
      v_table.table_name
    ) using v_organization_id;
  end loop;

  delete from public.organizations where id = v_organization_id;
end;
$cleanup$;

delete from public.profiles where id = :'profile_id'::uuid;
set session_replication_role = origin;
SQL
  rm -rf -- "$run_dir"
}
trap cleanup EXIT

"${psql_base[@]}" \
  -v organization_id="$organization_id" \
  -v profile_id="$profile_id" \
  -v membership_id="$membership_id" \
  -v role_id="$role_id" \
  -v content_item_id="$content_item_id" \
  -v brief_id="$brief_id" <<'SQL'
insert into public.organizations (id, name, slug)
values (
  :'organization_id'::uuid,
  'M0.2 concurrency fixture',
  'm02-concurrency-' || replace(:'organization_id', '-', '')
);

set session_replication_role = replica;
insert into public.profiles (id, display_name)
values (:'profile_id'::uuid, 'M0.2 concurrency user');
set session_replication_role = origin;

insert into public.memberships (id, organization_id, profile_id)
values (
  :'membership_id'::uuid,
  :'organization_id'::uuid,
  :'profile_id'::uuid
);

insert into public.roles (id, organization_id, key, name)
values (
  :'role_id'::uuid,
  :'organization_id'::uuid,
  'owner',
  'Owner'
);

insert into public.membership_role_grants (
  organization_id, membership_id, role_id, granted_by_membership_id
)
values (
  :'organization_id'::uuid,
  :'membership_id'::uuid,
  :'role_id'::uuid,
  :'membership_id'::uuid
);

insert into public.role_permission_grants (
  organization_id, role_id, permission_id, granted_by_membership_id
)
select
  :'organization_id'::uuid,
  :'role_id'::uuid,
  id,
  :'membership_id'::uuid
from public.permissions;

insert into public.content_items (
  id, organization_id, title, created_by_membership_id
)
values (
  :'content_item_id'::uuid,
  :'organization_id'::uuid,
  'M0.2 concurrent generation',
  :'membership_id'::uuid
);

insert into public.content_briefs (
  id, organization_id, content_item_id, payload, payload_hash,
  created_by_membership_id
)
values (
  :'brief_id'::uuid,
  :'organization_id'::uuid,
  :'content_item_id'::uuid,
  '{"purpose":"concurrent idempotency"}'::jsonb,
  app_private.sha256_jsonb('{"purpose":"concurrent idempotency"}'::jsonb),
  :'membership_id'::uuid
);
SQL

pids=()
for request_number in $(seq 1 "$parallel_requests"); do
  output_file="$run_dir/request-$request_number.out"
  error_file="$run_dir/request-$request_number.err"
  (
    "${psql_base[@]}" -A -t \
      -v organization_id="$organization_id" \
      -v profile_id="$profile_id" \
      -v brief_id="$brief_id" \
      -v idempotency_key="$idempotency_key" <<'SQL'
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', :'profile_id',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  false
);
set role authenticated;
select public.m1_request_generation(
  :'organization_id'::uuid,
  :'brief_id'::uuid,
  'm0_2.concurrent',
  1,
  :'idempotency_key',
  gen_random_uuid()
);
SQL
  ) >"$output_file" 2>"$error_file" &
  pids+=("$!")
done

failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failed=1
  fi
done

if (( failed != 0 )); then
  for error_file in "$run_dir"/*.err; do
    if [[ -s "$error_file" ]]; then
      sed -n '1,80p' "$error_file" >&2
    fi
  done
  printf '%s\n' "ERROR: At least one concurrent request failed." >&2
  exit 1
fi

unique_result_count="$(
  sed '/^[[:space:]]*$/d' "$run_dir"/*.out | sort -u | wc -l | tr -d ' '
)"
returned_result_count="$(
  sed '/^[[:space:]]*$/d' "$run_dir"/*.out | wc -l | tr -d ' '
)"

read -r job_count outbox_count job_id < <(
  "${psql_base[@]}" -A -t -F ' ' \
    -v organization_id="$organization_id" \
    -v idempotency_key="$idempotency_key" <<'SQL'
select
  count(*)::text,
  (
    select count(*)::text
    from public.outbox_events o
    where o.organization_id = :'organization_id'::uuid
      and o.aggregate_type = 'generation_job'
  ),
  min(id::text)
from public.generation_jobs
where organization_id = :'organization_id'::uuid
  and idempotency_key = :'idempotency_key';
SQL
)

if [[ "$returned_result_count" != "$parallel_requests" ]]; then
  printf '%s\n' \
    "ERROR: Expected $parallel_requests returned job IDs, received $returned_result_count." >&2
  exit 1
fi
if [[ "$unique_result_count" != "1" || "$job_count" != "1" || "$outbox_count" != "1" ]]; then
  printf '%s\n' \
    "ERROR: Concurrent duplicate invariant failed (unique=$unique_result_count jobs=$job_count outbox=$outbox_count)." >&2
  exit 1
fi

if "${psql_base[@]}" \
  -v organization_id="$organization_id" \
  -v profile_id="$profile_id" \
  -v brief_id="$brief_id" \
  -v idempotency_key="$idempotency_key" <<'SQL' >/dev/null 2>&1
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', :'profile_id',
    'role', 'authenticated',
    'aal', 'aal1'
  )::text,
  false
);
set role authenticated;
select public.m1_request_generation(
  :'organization_id'::uuid,
  :'brief_id'::uuid,
  'm0_2.concurrent',
  2,
  :'idempotency_key',
  gen_random_uuid()
);
SQL
then
  printf '%s\n' \
    "ERROR: Reusing the idempotency key with a changed prompt version succeeded." >&2
  exit 1
fi

"${psql_base[@]}" \
  -v organization_id="$organization_id" \
  -v parallel_requests="$parallel_requests" <<'SQL'
update public.outbox_events
set available_at = statement_timestamp() + interval '1 hour'
where organization_id = :'organization_id'::uuid
  and aggregate_type = 'generation_job';

insert into public.outbox_events (
  organization_id, event_type, aggregate_type, aggregate_id,
  payload, correlation_id
)
select
  :'organization_id'::uuid,
  'acceptance.concurrent_claim.v1',
  'acceptance',
  gen_random_uuid(),
  jsonb_build_object('request_number', request_number),
  gen_random_uuid()
from generate_series(1, :'parallel_requests'::integer) request_number;
SQL

claim_directory="$run_dir/outbox-claims"
mkdir -p "$claim_directory"
claim_pids=()
for request_number in $(seq 1 "$parallel_requests"); do
  output_file="$claim_directory/worker-$request_number.out"
  error_file="$claim_directory/worker-$request_number.err"
  (
    "${psql_base[@]}" -A -t <<SQL
set role service_role;
select event_id
from public.m0_claim_outbox_events(
  'concurrency-worker-$request_number',
  1,
  60
);
SQL
  ) >"$output_file" 2>"$error_file" &
  claim_pids+=("$!")
done

claim_failed=0
for pid in "${claim_pids[@]}"; do
  if ! wait "$pid"; then
    claim_failed=1
  fi
done

if (( claim_failed != 0 )); then
  for error_file in "$claim_directory"/*.err; do
    if [[ -s "$error_file" ]]; then
      sed -n '1,80p' "$error_file" >&2
    fi
  done
  printf '%s\n' "ERROR: At least one concurrent outbox claim failed." >&2
  exit 1
fi

claim_result_count="$(
  sed '/^[[:space:]]*$/d' "$claim_directory"/*.out \
    | wc -l \
    | tr -d ' '
)"
unique_claim_count="$(
  sed '/^[[:space:]]*$/d' "$claim_directory"/*.out \
    | sort -u \
    | wc -l \
    | tr -d ' '
)"

read -r processing_count lease_token_count minimum_attempts maximum_attempts < <(
  "${psql_base[@]}" -A -t -F ' ' \
    -v organization_id="$organization_id" <<'SQL'
select
  count(*)::text,
  count(distinct lease_token)::text,
  min(attempts)::text,
  max(attempts)::text
from public.outbox_events
where organization_id = :'organization_id'::uuid
  and event_type = 'acceptance.concurrent_claim.v1'
  and status = 'processing';
SQL
)

if [[ "$claim_result_count" != "$parallel_requests" \
   || "$unique_claim_count" != "$parallel_requests" \
   || "$processing_count" != "$parallel_requests" \
   || "$lease_token_count" != "$parallel_requests" \
   || "$minimum_attempts" != "1" \
   || "$maximum_attempts" != "1" ]]; then
  printf '%s\n' \
    "ERROR: Concurrent outbox lease invariant failed (returned=$claim_result_count unique=$unique_claim_count processing=$processing_count tokens=$lease_token_count min_attempts=$minimum_attempts max_attempts=$maximum_attempts)." >&2
  exit 1
fi

printf '%s\n' \
  "{\"test\":\"m0_2_concurrent_idempotency\",\"status\":\"pass\",\"parallel_requests\":$parallel_requests,\"unique_job_ids\":$unique_result_count,\"generation_jobs\":$job_count,\"outbox_events\":$outbox_count,\"mismatched_request_denied\":true,\"job_id\":\"$job_id\"}"
printf '%s\n' \
  "{\"test\":\"m0_2_concurrent_outbox_leasing\",\"status\":\"pass\",\"parallel_workers\":$parallel_requests,\"unique_claims\":$unique_claim_count,\"processing_events\":$processing_count,\"unique_lease_tokens\":$lease_token_count,\"attempts_per_event\":1}"
