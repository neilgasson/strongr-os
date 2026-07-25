#!/usr/bin/env bash
set -euo pipefail

database_url="${STRONGR_OS_DATABASE_URL:-}"

if [[ -z "$database_url" ]]; then
  printf '%s\n' "ERROR: STRONGR_OS_DATABASE_URL is required." >&2
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  printf '%s\n' "ERROR: psql is required." >&2
  exit 2
fi

printf '%s\n' '# Strongr OS M0.2 operational metrics'
printf '%s\n' '# TYPE strongr_os_outbox_ready gauge'
printf '%s\n' '# TYPE strongr_os_outbox_processing gauge'
printf '%s\n' '# TYPE strongr_os_outbox_expired_leases gauge'
printf '%s\n' '# TYPE strongr_os_outbox_dead_letters gauge'
printf '%s\n' '# TYPE strongr_os_outbox_oldest_ready_seconds gauge'
printf '%s\n' '# TYPE strongr_os_worker_stale gauge'

psql "$database_url" -X -qAt -v ON_ERROR_STOP=1 -F ' ' <<'SQL'
select metric_name, metric_value
from public.m0_operational_metrics()
order by metric_name;
SQL
