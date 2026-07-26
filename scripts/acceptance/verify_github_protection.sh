#!/usr/bin/env bash
set -euo pipefail

repository="${STRONGR_OS_GITHUB_REPOSITORY:-neilgasson/strongr-os}"
branch="${STRONGR_OS_PROTECTED_BRANCH:-main}"
required_checks="${STRONGR_OS_REQUIRED_CHECKS:-Database contract / test,M0.2 reliability proof / acceptance}"
pull_request="${STRONGR_OS_PULL_REQUEST:-1}"
expected_sha="${STRONGR_OS_EXPECTED_SHA:-}"
governance_mode="${STRONGR_OS_GOVERNANCE_MODE:-independent-review}"

if ! command -v gh >/dev/null 2>&1; then
  printf '%s\n' "ERROR: gh is required." >&2
  exit 2
fi
if ! gh auth status >/dev/null 2>&1; then
  printf '%s\n' "ERROR: gh is not authenticated." >&2
  exit 2
fi
if [[ ! "$pull_request" =~ ^[1-9][0-9]*$ ]]; then
  printf '%s\n' "ERROR: STRONGR_OS_PULL_REQUEST must be a positive integer." >&2
  exit 2
fi
if [[ -n "$expected_sha" && ! "$expected_sha" =~ ^[a-f0-9]{40}$ ]]; then
  printf '%s\n' "ERROR: STRONGR_OS_EXPECTED_SHA must be a full commit SHA." >&2
  exit 2
fi
if [[ "$governance_mode" != "independent-review" \
  && "$governance_mode" != "solo-maintainer" ]]; then
  printf '%s\n' \
    "ERROR: STRONGR_OS_GOVERNANCE_MODE must be independent-review or solo-maintainer." >&2
  exit 2
fi

run_directory="$(mktemp -d -t strongr-os-github-protection.XXXXXX)"
cleanup() {
  rm -rf -- "$run_directory"
}
trap cleanup EXIT

gh api "repos/$repository" >"$run_directory/repository.json"
gh api "repos/$repository/pulls/$pull_request" \
  >"$run_directory/pull-request.json"
pull_request_head="$(
  python3 -c \
    'import json,sys; print(json.load(open(sys.argv[1]))["head"]["sha"])' \
    "$run_directory/pull-request.json"
)"

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

actions_available=true
if ! gh api \
  "repos/$repository/actions/runs?head_sha=$pull_request_head&per_page=100" \
  >"$run_directory/action-runs.json" \
  2>"$run_directory/action-runs.err"; then
  actions_available=false
  printf '%s\n' '{"workflow_runs":[]}' >"$run_directory/action-runs.json"
fi

python3 - \
  "$run_directory/repository.json" \
  "$run_directory/protection.json" \
  "$run_directory/rulesets.json" \
  "$run_directory/pull-request.json" \
  "$run_directory/action-runs.json" \
  "$branch" \
  "$required_checks" \
  "$protection_available" \
  "$rulesets_available" \
  "$actions_available" \
  "$expected_sha" \
  "$governance_mode" <<'PY'
import json
import pathlib
import subprocess
import sys

repo = json.loads(pathlib.Path(sys.argv[1]).read_text())
protection = json.loads(pathlib.Path(sys.argv[2]).read_text())
rulesets = json.loads(pathlib.Path(sys.argv[3]).read_text())
pull_request = json.loads(pathlib.Path(sys.argv[4]).read_text())
action_runs = json.loads(pathlib.Path(sys.argv[5]).read_text())
branch = sys.argv[6]
expected_checks = {item.strip() for item in sys.argv[7].split(",") if item.strip()}
protection_available = sys.argv[8] == "true"
rulesets_available = sys.argv[9] == "true"
actions_available = sys.argv[10] == "true"
expected_sha = sys.argv[11]
governance_mode = sys.argv[12]

checks = set()
requires_pull_request = False
required_approvals = 0
requires_codeowners = False
dismisses_stale_reviews = False
strict_checks = False
blocks_force_push = False
blocks_deletion = False
blocks_admin_bypass = False
requires_conversation_resolution = False
has_ruleset_bypass = False

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
    blocks_admin_bypass = bool(
        (protection.get("enforce_admins") or {}).get("enabled")
    )
    requires_conversation_resolution = bool(
        (protection.get("required_conversation_resolution") or {}).get(
            "enabled"
        )
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


active_branch_ruleset = False
for ruleset in expanded_rulesets:
    if ruleset.get("enforcement") != "active":
        continue
    if not targets_branch(ruleset):
        continue
    active_branch_ruleset = True
    if ruleset.get("bypass_actors"):
        has_ruleset_bypass = True
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
        elif rule_type == "required_conversation_resolution":
            requires_conversation_resolution = True

if active_branch_ruleset and not has_ruleset_bypass:
    blocks_admin_bypass = True

missing_checks = sorted(expected_checks - checks)
observed_run_checks = {}
for run in action_runs.get("workflow_runs") or []:
    run_name = run.get("name") or ""
    run_id = run.get("id")
    if not run_name or run_id is None:
        continue
    completed = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{repo.get('full_name')}/actions/runs/{run_id}/jobs?per_page=100",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        actions_available = False
        continue
    for job in json.loads(completed.stdout).get("jobs") or []:
        context = f"{run_name} / {job.get('name')}"
        observed_run_checks[context] = {
            "status": job.get("status"),
            "conclusion": job.get("conclusion"),
            "url": job.get("html_url"),
        }

missing_successful_runs = sorted(
    check
    for check in expected_checks
    if observed_run_checks.get(check, {}).get("conclusion") != "success"
)
result = {
    "test": "github_protection_and_required_checks",
    "repository": repo.get("full_name"),
    "private": bool(repo.get("private")),
    "default_branch": repo.get("default_branch"),
    "target_branch": branch,
    "pull_request_number": pull_request.get("number"),
    "pull_request_state": pull_request.get("state"),
    "pull_request_draft": bool(pull_request.get("draft")),
    "pull_request_base": (pull_request.get("base") or {}).get("ref"),
    "pull_request_head_sha": (pull_request.get("head") or {}).get("sha"),
    "expected_head_sha": expected_sha or None,
    "governance_mode": governance_mode,
    "protection_api_available": protection_available,
    "rulesets_api_available": rulesets_available,
    "actions_api_available": actions_available,
    "requires_pull_request": requires_pull_request,
    "required_approvals": required_approvals,
    "requires_codeowners": requires_codeowners,
    "dismisses_stale_reviews": dismisses_stale_reviews,
    "strict_required_checks": strict_checks,
    "blocks_force_push": blocks_force_push,
    "blocks_deletion": blocks_deletion,
    "blocks_admin_bypass": blocks_admin_bypass,
    "requires_conversation_resolution": requires_conversation_resolution,
    "has_ruleset_bypass": has_ruleset_bypass,
    "observed_required_checks": sorted(checks),
    "missing_required_checks": missing_checks,
    "observed_pull_request_checks": observed_run_checks,
    "missing_successful_pull_request_checks": missing_successful_runs,
}

failures = []
if not result["private"]:
    failures.append("repository is not private")
if result["default_branch"] != branch:
    failures.append("default branch does not match target")
if result["pull_request_state"] != "open":
    failures.append("pull request is not open")
if result["pull_request_base"] != branch:
    failures.append("pull request base does not match target branch")
if expected_sha and result["pull_request_head_sha"] != expected_sha:
    failures.append("pull request head does not match expected commit")
if not requires_pull_request:
    failures.append("pull requests are not required")
if governance_mode == "independent-review":
    if required_approvals < 1:
        failures.append("at least one approval is not required")
    if not requires_codeowners:
        failures.append("CODEOWNERS review is not required")
    if not dismisses_stale_reviews:
        failures.append("stale approvals are not dismissed")
else:
    if required_approvals != 0:
        failures.append("solo-maintainer mode must require zero approvals")
    if requires_codeowners:
        failures.append("solo-maintainer mode cannot require CODEOWNERS approval")
    if has_ruleset_bypass or not blocks_admin_bypass:
        failures.append("solo-maintainer mode permits ruleset bypass")
if not strict_checks:
    failures.append("strict required checks are not enabled")
if not requires_conversation_resolution:
    failures.append("conversation resolution is not required")
if not blocks_force_push:
    failures.append("force pushes are not blocked")
if not blocks_deletion:
    failures.append("branch deletion is not blocked")
if missing_checks:
    failures.append("required checks are missing")
if not actions_available:
    failures.append("workflow run or job evidence is unavailable")
if missing_successful_runs:
    failures.append("required checks are not successful on the pull-request head")

result["status"] = "pass" if not failures else "fail"
result["failures"] = failures
print(json.dumps(result, separators=(",", ":"), sort_keys=True))
raise SystemExit(0 if not failures else 1)
PY
