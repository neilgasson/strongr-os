#!/usr/bin/env bash
set -uo pipefail

artifact_dir="${STRONGR_OS_M1_ARTIFACT_DIR:-artifacts/m1}"
mkdir -p "$artifact_dir"
summary="$artifact_dir/summary.jsonl"
: >"$summary"

failed=0

run_check() {
  local name="$1"
  shift
  local log="$artifact_dir/${name}.log"
  local status

  "$@" 2>&1 | tee "$log"
  status="${PIPESTATUS[0]}"

  if ((status == 0)); then
    printf '{"check":"%s","status":"pass","sha":"%s"}\n' \
      "$name" "${GITHUB_SHA:-local}" >>"$summary"
  else
    printf '{"check":"%s","status":"fail","exit_code":%d,"sha":"%s"}\n' \
      "$name" "$status" "${GITHUB_SHA:-local}" >>"$summary"
    failed=1
  fi
}

run_check format pnpm format:check
run_check lint pnpm lint
run_check typecheck pnpm typecheck
run_check schemas pnpm schema:check
run_check tests pnpm test
run_check build pnpm build
run_check boundaries pnpm boundaries:check

exit "$failed"
