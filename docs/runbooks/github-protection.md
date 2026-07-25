# GitHub Protection and Required Checks

## Required state

Repository: `neilgasson/strongr-os`
Protected branch: `main`

The repository must be private. `main` must:

- require a pull request;
- require at least one approval;
- require CODEOWNERS review;
- dismiss stale approvals after new commits;
- block force pushes and branch deletion;
- require the branch to be current with `main`; and
- require these exact checks:
  - `Database contract / test`
  - `M0.2 reliability proof / acceptance`

Do not merge draft PR #1 without Neil's approval.

## Automated verification

With GitHub CLI authenticated for `neilgasson/strongr-os`:

```bash
STRONGR_OS_PULL_REQUEST=1 \
STRONGR_OS_EXPECTED_SHA='[full M0.2 commit SHA]' \
scripts/acceptance/verify_github_protection.sh \
  | tee m0-2-github-protection.jsonl
```

The script reads repository visibility, classic branch protection, repository
rulesets, pull-request metadata, workflow runs, and every job on the current
pull-request head. It makes no change. A failure reports missing controls,
head-SHA drift, or checks that are absent, pending, cancelled, or unsuccessful.

Required checks must have run successfully on the latest pull-request commit.
An older green run is not acceptance evidence.

## Manual owner fallback

If the account plan or repository UI does not expose a required control,
capture the exact GitHub message and stop the merge. Do not silently weaken
the gate.

In GitHub:

1. Open **Settings → Rules → Rulesets**.
2. Create or edit the active branch ruleset targeting `main`.
3. Apply every control listed above.
4. Select both exact status checks after each has run at least once.
5. Save, rerun the verification script, and attach its JSON output to the
   M0.2 evidence.
