#!/usr/bin/env bash
set -euo pipefail

database_url="${STRONGR_OS_DATABASE_URL:-}"
allow_degraded="${STRONGR_OS_HEALTH_ALLOW_DEGRADED:-false}"

if [[ -z "$database_url" ]]; then
  printf '%s\n' "ERROR: STRONGR_OS_DATABASE_URL is required." >&2
  exit 2
fi
if ! command -v psql >/dev/null 2>&1; then
  printf '%s\n' "ERROR: psql is required." >&2
  exit 2
fi

health_json="$(
  psql "$database_url" -X -qAt -v ON_ERROR_STOP=1 \
    -c "select public.m0_operational_health()::text"
)"

python3 - "$health_json" "$allow_degraded" <<'PY'
import json
import sys

health = json.loads(sys.argv[1])
allow_degraded = sys.argv[2].lower() == "true"
status = health.get("status")

print(json.dumps({
    "check": "strongr_os_m0_2_health",
    **health,
}, separators=(",", ":"), sort_keys=True))

if status == "ok":
    raise SystemExit(0)
if status == "degraded" and allow_degraded:
    raise SystemExit(0)
raise SystemExit(1)
PY
