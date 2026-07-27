#!/usr/bin/env bash
set -euo pipefail

repository_root="$(
  git rev-parse --show-toplevel 2>/dev/null
)" || {
  printf '%s\n' "ERROR: Run inside the strongr-os Git repository." >&2
  exit 2
}
cd "$repository_root"

git diff --check
bash -n scripts/acceptance/*.sh
bash -n scripts/ops/*.sh

pycache_directory="$(mktemp -d -t strongr-os-pycache.XXXXXX)"
cleanup() {
  rm -rf -- "$pycache_directory"
}
trap cleanup EXIT
PYTHONPYCACHEPREFIX="$pycache_directory" \
  python3 -m py_compile scripts/acceptance/*.py

python3 - <<'PY'
import json
import pathlib
import re
import sys

root = pathlib.Path.cwd()
failures = []

for path in sorted((root / "supabase" / "migrations").glob("*.sql")):
    text = path.read_text()
    executable = "\n".join(
        line for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("--")
    ).strip().lower()
    if not executable.startswith("begin;"):
        failures.append(f"{path}: migration does not begin transactionally")
    if not executable.endswith("commit;"):
        failures.append(f"{path}: migration does not commit transactionally")

for path in sorted((root / "supabase" / "tests").glob("*.sql")):
    text = path.read_text()
    plan_match = re.search(r"select\s+plan\((\d+)\)", text, re.IGNORECASE)
    if not plan_match:
        failures.append(f"{path}: pgTAP plan is missing")
        continue
    plan = int(plan_match.group(1))
    assertions = len(
        re.findall(
            r"^select\s+(?:is|isnt|ok|throws_ok|lives_ok|has_table)\s*\(",
            text,
            re.IGNORECASE | re.MULTILINE,
        )
    )
    if plan != assertions:
        failures.append(
            f"{path}: plan is {plan}, but {assertions} assertions were found"
        )

baseline = root / "supabase" / "tests" / "000_m0_m1_database_contract.sql"
baseline_text = baseline.read_text()
if "select plan(17);" not in baseline_text:
    failures.append("the original 17-test contract changed its plan")

repair = (
    root
    / "supabase"
    / "migrations"
    / "202607242230_m1_restrict_check_worker_execute.sql"
).read_text()
for role, expected in (
    ("anon", "deny"),
    ("authenticated", "deny"),
    ("service_role", "allow"),
):
    if role not in repair:
        failures.append(f"worker repair does not mention {role} ({expected})")

json.loads(
    (
        root
        / "evidence"
        / "m0-2"
        / "acceptance-record.template.json"
    ).read_text()
)
json.loads(
    (
        root
        / "evidence"
        / "m1"
        / "acceptance-record.json"
    ).read_text()
)
json.loads(
    (
        root
        / "evidence"
        / "m1"
        / "acceptance-record.template.json"
    ).read_text()
)

expected_migrations = [
    "202607241230_m0_governed_platform_kernel.sql",
    "202607241330_m1_governed_audio_reflection.sql",
    "202607242230_m1_restrict_check_worker_execute.sql",
    "202607251200_m0_2_reliability_primitives.sql",
    "202607251230_m0_2_request_idempotency_fingerprint.sql",
    "202607251830_m0_2_restrict_anon_security_definer.sql",
    "20260726161909_m1_1_durable_worker_commands.sql",
    "20260726205703_m1_2_brief_to_draft.sql",
    "20260727015650_m2_media_storage_foundation.sql",
]
observed_migrations = [
    path.name
    for path in sorted((root / "supabase" / "migrations").glob("*.sql"))
]
if observed_migrations != expected_migrations:
    failures.append("the M2.0 repository migration inventory changed")

if failures:
    for failure in failures:
        print(f"ERROR: {failure}", file=sys.stderr)
    raise SystemExit(1)

print(json.dumps({
    "test": "m0_2_repository_static_validation",
    "status": "pass",
    "migration_count": len(list((root / "supabase" / "migrations").glob("*.sql"))),
    "pg_tap_file_count": len(list((root / "supabase" / "tests").glob("*.sql"))),
    "original_contract_plan": 17,
}, separators=(",", ":"), sort_keys=True))
PY

if git grep -nE \
  'eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}' \
  -- . ':(exclude)docs/**' >/dev/null; then
  printf '%s\n' "ERROR: A JWT-like secret was found in tracked source." >&2
  exit 1
fi

if git diff --name-only \
  ca26e554893643a3975b979089c78505001be13a -- \
  | grep -Eiq 'strongr[-_ ]?daily'; then
  printf '%s\n' "ERROR: A Strongr Daily path appears in the M0.2 diff." >&2
  exit 1
fi

printf '%s\n' \
  '{"test":"strongr_daily_repository_isolation","status":"pass"}'
