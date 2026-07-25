#!/usr/bin/env bash
set -euo pipefail

repository="${STRONGR_OS_GITHUB_REPOSITORY:-neilgasson/strongr-os}"
branch="${STRONGR_OS_PROTECTED_BRANCH:-main}"
required_checks="${STRONGR_OS_REQUIRED_CHECKS:-Database contract / test,M0.2 reliability proof / acceptance}"

if ! command -v gh >/dev/null 2>&1; then
  printf '%s\n' "ERROR: gh is required." >&2
  exit 2
fi
if ! gh auth status >/dev/null 2>&1; then
  printf '%s\n' "ERROR: gh is not authenticated." >&2
  exit 2
fi

run_directory="$(mktemp -d -t strongr-os-github-protection.XXXXXX)"
cleanup() {
  rm -rf -- "$run_directory"
}
trap cleanup EXIT

gh api "repos/$repository" >"$run_directory/repository.json"

protection_available=true
if ! gh api "repos/$repository/branches/$branch/protection" \
  >"$run_directory/protection.json" 2>"$run_directory/protection.err"; then
  protection_available=false
  printf '%s\n' '{}' >"$run_directory/protection.json"
fi

rulesets_available=true
if ! gh api "repos/$repository/rulesets?includes_parents=true" \
  >"$run_directory/rulesets.json" 2>"$run_directory/rulesets.err"; then
  rulesets_available=false
  printf '%s\n' '[]' >"$run_directory/rulesets.json"
fi

python3 - \
  "$run_directory/repository.json" \
  "$run_directory/protection.json" \
  "$run_directory/rulesets.json" \
  "$branch" \
  "$required_checks" \
  "$protection_available" \
  "$rulesets_available" <<'PY'
import json
import pathlib
import subprocess
import sys

repo = json.loads(pathlib.Path(sys.argv[1]).read_text())
protection = json.loads(pathlib.Path(sys.argv[2]).read_text())
rulesets = json.loads(pathlib.Path(sys.argv[3]).read_text())
branch = sys.argv[4]
expected_checks = {item.strip() for item in sys.argv[5].split(",") if item.strip()}
protection_available = sys.argv[6] == "true"
rulesets_available = sys.argv[7] == "true"

checks = set()
requires_pull_request = False
required_approvals = 0
requires_codeowners = False
dismisses_stale_reviews = False
strict_checks = False
blocks_force_push = False
blocks_deletion = False

status_checks = protection.get("required_status_checks") or {}
strict_checks = bool(status_checks.get("strict"))
for context in status_checks.get("contexts") or []:
    checks.add(context)
for item in status_checks.get("checks") or []:
    if isinstance(item, dict) and item.get("context"):
        checks.add(item["context"])

reviews = protection.get("required_pull_request_reviews") or {}
if reviews:
    requires_pull_request = True
    required_approvals = max(
        required_approvals,
        int(reviews.get("required_approving_review_count") or 0),
    )
    requires_codeowners = bool(reviews.get("require_code_owner_reviews"))
    dismisses_stale_reviews = bool(reviews.get("dismiss_stale_reviews"))

if protection:
    blocks_force_push = not bool(
        (protection.get("allow_force_pushes") or {}).get("enabled")
    )
    blocks_deletion = not bool(
        (protection.get("allow_deletions") or {}).get("enabled")
    )

expanded_rulesets = []
for ruleset in rulesets if isinstance(rulesets, list) else []:
    if "rules" not in ruleset and ruleset.get("id") is not None:
        completed = subprocess.run(
            [
                "gh",
                "api",
                f"repos/{repo.get('full_name')}/rulesets/{ruleset['id']}",
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if completed.returncode == 0:
            ruleset = json.loads(completed.stdout)
    expanded_rulesets.append(ruleset)


def targets_branch(ruleset):
    if ruleset.get("target") not in {None, "branch"}:
        return False
    ref_name = (ruleset.get("conditions") or {}).get("ref_name") or {}
    includes = ref_name.get("include") or []
    excludes = ref_name.get("exclude") or []
    candidates = {branch, f"refs/heads/{branch}", "~DEFAULT_BRANCH"}
    if any(item in candidates for item in excludes):
        return False
    return not includes or any(item in candidates for item in includes)


for ruleset in expanded_rulesets:
    if ruleset.get("enforcement") not in {"active", "evaluate"}:
        continue
    if not targets_branch(ruleset):
        continue
    for rule in ruleset.get("rules") or []:
        rule_type = rule.get("type")
        params = rule.get("parameters") or {}
        if rule_type == "pull_request":
            requires_pull_request = True
            required_approvals = max(
                required_approvals,
                int(params.get("required_approving_review_count") or 0),
            )
            requires_codeowners = (
                requires_codeowners
                or bool(params.get("require_code_owner_review"))
            )
            dismisses_stale_reviews = (
                dismisses_stale_reviews
                or bool(params.get("dismiss_stale_reviews_on_push"))
            )
        elif rule_type == "required_status_checks":
            strict_checks = (
                strict_checks
                or bool(params.get("strict_required_status_checks_policy"))
            )
            for item in params.get("required_status_checks") or []:
                if item.get("context"):
                    checks.add(item["context"])
        elif rule_type == "non_fast_forward":
            blocks_force_push = True
        elif rule_type == "deletion":
            blocks_deletion = True

missing_checks = sorted(expected_checks - checks)
result = {
    "test": "github_protection_and_required_checks",
    "repository": repo.get("full_name"),
    "private": bool(repo.get("private")),
    "default_branch": repo.get("default_branch"),
    "target_branch": branch,
    "protection_api_available": protection_available,
    "rulesets_api_available": rulesets_available,
    "requires_pull_request": requires_pull_request,
    "required_approvals": required_approvals,
    "requires_codeowners": requires_codeowners,
    "dismisses_stale_reviews": dismisses_stale_reviews,
    "strict_required_checks": strict_checks,
    "blocks_force_push": blocks_force_push,
    "blocks_deletion": blocks_deletion,
    "observed_required_checks": sorted(checks),
    "missing_required_checks": missing_checks,
}

failures = []
if not result["private"]:
    failures.append("repository is not private")
if result["default_branch"] != branch:
    failures.append("default branch does not match target")
if not requires_pull_request:
    failures.append("pull requests are not required")
if required_approvals < 1:
    failures.append("at least one approval is not required")
if not requires_codeowners:
    failures.append("CODEOWNERS review is not required")
if not dismisses_stale_reviews:
    failures.append("stale approvals are not dismissed")
if not strict_checks:
    failures.append("strict required checks are not enabled")
if not blocks_force_push:
    failures.append("force pushes are not blocked")
if not blocks_deletion:
    failures.append("branch deletion is not blocked")
if missing_checks:
    failures.append("required checks are missing")

result["status"] = "pass" if not failures else "fail"
result["failures"] = failures
print(json.dumps(result, separators=(",", ":"), sort_keys=True))
raise SystemExit(0 if not failures else 1)
PY
