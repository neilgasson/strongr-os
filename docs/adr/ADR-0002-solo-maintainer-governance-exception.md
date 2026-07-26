# ADR-0002: Temporary Solo-Maintainer Governance Exception

## Status

Accepted by the repository owner on 2026-07-26.

## Context

Strongr OS currently has one maintainer with repository write access. GitHub
does not allow a pull-request author to approve their own change, and automated
reviews do not satisfy a required approving review. Enforcing an independent
approval now would make every change unmergeable without misrepresenting a
second account or automated agent as an independent reviewer.

The M0.2 governance contract must remain accurate and enforceable. The absence
of a second maintainer must not silently disable pull requests, required
checks, branch freshness, or protection against destructive branch changes.

## Decision

Until a second trusted maintainer accepts write access:

- every change to `main` must use a pull request;
- `Database contract / test` and
  `M0.2 reliability proof / acceptance` must pass on the current head;
- the branch must be current with `main`;
- all conversations must be resolved;
- force pushes and branch deletion remain blocked;
- ruleset bypass is not granted to users, teams, integrations, or
  administrators;
- required approving reviews are set to zero;
- CODEOWNERS remains documented but its approval is not a merge requirement;
  and
- the owner must inspect the complete diff and explicitly approve the merge.

Automated review may supplement the owner's review but is not represented as
independent approval.

## Consequences

This exception preserves enforceable automated and branch-safety controls while
acknowledging that independent human review is unavailable. It provides less
separation of duties than the target governance model, so changes must remain
small, evidence-backed, and reversible.

M0.2 acceptance records must name this ADR and record the owner's approval.
They must not claim an independent reviewer approved the change.

## Exit condition

When a second trusted maintainer accepts write access, the owner must:

1. require at least one approving review;
2. require CODEOWNERS review;
3. dismiss stale approvals after new commits;
4. update the protection verifier and runbook to independent-review mode; and
5. supersede this ADR.
