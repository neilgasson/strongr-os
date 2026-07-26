# GitHub Protection and Required Checks

## Required state

Repository: `neilgasson/strongr-os`
Protected branch: `main`

The repository must be private. `main` must:

- require a pull request;
- block force pushes and branch deletion;
- require the branch to be current with `main`; and
- require all conversations to be resolved;
- require these exact checks:
  - `Database contract / test`
  - `M0.2 reliability proof / acceptance`

Both required workflows run on every pull request so these checks cannot remain
permanently expected on documentation-only or workflow-only changes.

## Solo-maintainer exception

ADR-0002 authorizes a temporary solo-maintainer mode while Neil is the
repository's only maintainer with write access. In this mode:

- required approving reviews are set to zero;
- CODEOWNERS review is not required for merge;
- no user, team, integration, or administrator receives a ruleset bypass;
- the owner must review the complete diff and explicitly approve the merge;
- both required checks and every other control above remain mandatory; and
- the exception must be removed when a second trusted maintainer accepts write
  access.

This exception does not treat an automated review, a second account controlled
by the owner, or the pull-request author as independent approval.

## Automated verification

With GitHub CLI authenticated for `neilgasson/strongr-os`:

```bash
STRONGR_OS_PULL_REQUEST='[closeout PR number]' \
STRONGR_OS_EXPECTED_SHA='[full closeout PR head SHA]' \
STRONGR_OS_GOVERNANCE_MODE='solo-maintainer' \
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
3. Apply every control listed above, with zero required approvals and no
   bypass actors while the solo-maintainer exception is active.
4. Select both exact status checks after each has run at least once.
5. Save, rerun the verification script, and attach its JSON output to the
   M0.2 evidence.
