# M4.1 staging resource decision gate

Status: owner-approved and machine-validated; no staging resource or credential
exists, and provider cost confirmation remains pending.

## Purpose

This gate converts the accepted M4.0 architecture into an exact, reviewable
staging proposal before a provider, project, host, secret, backup destination,
or telemetry stack is created.

The governing decision is
[`ADR-0005`](../adr/ADR-0005-separate-staging-control-plane.md). The
machine-readable authority is
[`ops/staging/staging-resource-contract.json`](../../ops/staging/staging-resource-contract.json).
If prose and the JSON contract differ, provisioning must stop and the protected
change must be corrected.

## Current facts verified on 2026-07-28

- Protected `main` contains accepted M4.0 merge `3078e2f`.
- The `Strongr OS` Supabase organization is on the Free plan.
- Its two active projects are `strongr-os-dev` and
  `strongr-os-disposable`, both in `ca-central-1`.
- No `strongr-os-staging` Supabase project exists.
- GitHub has only the existing `m0-2-acceptance` environment.
- The repository is public, so GitHub deployment environments and required
  reviewers are available.
- The accepted M3 Sites project remains owner-only and bound only to
  `strongr-os-dev`.

## Exact proposed resources

| Resource | Exact proposal | Initial state |
|---|---|---|
| Supabase organization | `Strongr OS Staging`, Pro, direct Supabase billing, Spend Cap enabled | Must be created by owner |
| Supabase project | `strongr-os-staging`, Micro, GA, `ca-central-1`, no add-ons | Must use provider cost confirmation |
| GitHub Environment | `strongr-os-staging`, protected-main deployments only, required reviewer `neilgasson` | Uncreated |
| Static host | New OpenAI Sites project `Strongr Studio Staging`, custom owner-only access | Uncreated |
| Worker runtime | Bounded GitHub-hosted Actions job using the staging Environment | No workflow or credential yet |
| Recovery account | Backblaze B2 account label `Strongr OS Staging Recovery`, Canada East | Uncreated |
| Recovery bucket | `strongr-os-staging-recovery-20260728`, private, Object Lock enabled, 35-day lifecycle | Uncreated and name availability unverified |
| Telemetry | Grafana Cloud Free stack `strongrosstaging`, AWS `ca-central-1` | Uncreated |

If the organization, project, bucket, stack, region, plan, cost, or host name is
unavailable, do not substitute another value. Return through a protected
decision.

## Cost envelope

| Provider | Expected monthly USD | Allowed monthly USD | Controls |
|---|---:|---:|---|
| Supabase | 25 | 34 | Pro, one Micro project, Spend Cap on, no add-ons |
| Backblaze B2 | 0 below 10 GB | 1 | encrypted archives, lifecycle, usage evidence |
| Grafana Cloud | 0 | 0 | Free only; no payment upgrade |
| GitHub / OpenAI Sites | 0 incremental | 0 incremental | stop if provider presents a charge |
| **Total** | **25** | **35** | before tax; forecast above ceiling stops |

This is a budget authorization proposal, not a provider quote. Immediately
before project creation, the Supabase cost tool must report the actual recurring
amount, and the owner must confirm that amount.

## GitHub Environment contract

The environment is created before any staging secret and must have:

- exact name `strongr-os-staging`;
- deployment branches restricted to protected branches;
- required reviewer `neilgasson`;
- no administrator bypass in workflow logic;
- concurrency group `strongr-os-staging`;
- job permissions defaulted to `contents: read`;
- `workflow_dispatch` only for secret-bearing deployment, worker, recovery, or
  telemetry-collector jobs;
- exact full protected-main SHA input and preflight verification;
- evidence finalization and upload under `if: always()`.

Because there is currently one maintainer, prevent-self-review must remain off
or every deployment would be impossible. Each deployment still requires a
separate GitHub Environment approval.

## Environment values

Public GitHub Environment variables:

- `STAGING_SUPABASE_PROJECT_REF`;
- `STAGING_SUPABASE_URL`;
- `STAGING_SUPABASE_PUBLISHABLE_KEY`;
- `STAGING_B2_BUCKET`;
- `STAGING_B2_ENDPOINT`;
- `STAGING_GRAFANA_METRICS_ENDPOINT`.

Encrypted GitHub Environment secrets:

- `STAGING_SUPABASE_ACCESS_TOKEN`;
- `STAGING_SUPABASE_DB_PASSWORD`;
- `STAGING_SUPABASE_WORKER_SECRET_KEY`;
- `STAGING_TELEMETRY_DATABASE_URL`;
- `STAGING_B2_KEY_ID`;
- `STAGING_B2_APPLICATION_KEY`;
- `STAGING_BACKUP_ENCRYPTION_KEY`;
- `STAGING_GRAFANA_METRICS_WRITE_TOKEN`.

No repository-level staging secret is allowed. Values must never appear in
workflow arguments, logs, step summaries, screenshots, artifacts, or retained
evidence.

## Credential capabilities

| Credential | Capability | Explicit denial |
|---|---|---|
| Supabase access token | Link/configure the one staging project during approved provisioning/deployment | No development, disposable, production, or Strongr Daily target |
| Database password | Apply reviewed migrations and perform approved backup/restore | No browser, host, worker, telemetry SaaS, or evidence |
| Worker secret key | Existing machine commands and exact private Storage operations | No human review, approval, staging, revocation, publication, or browser |
| Telemetry database login | Connect and execute exact privacy-safe aggregate functions only | No table access, Data API, `pg_monitor`, `BYPASSRLS`, service role, or content |
| B2 application key | Exact bucket list/read/write/delete needed for lifecycle and restore | No other bucket or account administration |
| Backup encryption key | Client-side AES-256-GCM archive encryption/decryption | Never sent to B2 or Grafana |
| Grafana write token | Remote-write approved aggregate metric names | No query/admin scope and no Supabase access |

Every privileged credential is staging-only, separately revocable, and rotated
after any suspected disclosure. Operational recovery-key escrow is an encrypted
offline copy held by the owner outside GitHub, Backblaze, Supabase, and the
repository.

## Immutable deployment sequence

1. Owner approves the exact provider/cost contract and provider-reported
   Supabase recurring cost.
2. Create the named provider resources with empty synthetic state.
3. Record only safe assigned identifiers through a protected PR.
4. Create and protect the GitHub Environment before storing credentials.
5. Apply each committed migration once to the clean staging database and verify
   exact migration history.
6. Validate RLS, grants, Auth, private Storage, worker/service-role separation,
   synthetic fixtures, and Strongr Daily isolation.
7. Build once from an exact protected-main commit and record file and artifact
   SHA-256 digests.
8. Create the separate owner-only Sites project, re-read its access policy, and
   deploy that exact source/artifact state.
9. Add only the exact staging host origin to staging Auth redirects.
10. Prove a bounded worker run, owner-authenticated flow, configuration drift
    check, evidence upload, and cleanup.
11. Prove rollback to the preceding saved Sites version without altering
    database or Storage authority.

No workflow in this sequence targets production.

## Backup and telemetry boundaries

Daily M4 staging recovery will combine:

- Supabase's managed daily database backup on Pro;
- an independently generated encrypted logical/database evidence set;
- a complete canonical private Storage inventory;
- exact encrypted private object bytes in the private B2 bucket;
- a monthly isolated restore and reconciliation rehearsal.

Backblaze account data region is Canada East. The bucket is private, enables
Object Lock at creation, uses provider server-side encryption in addition to
client-side AES-256-GCM, and expires scheduled staging archives after 35 days
only after restore evidence exists.

Grafana receives only allowlisted counts, durations, health states, bounded
error codes, and saturation ratios. A protected collector queries exact
privacy-safe database functions with the telemetry login and remote-writes
using the Grafana write-only token. Direct Grafana-to-Supabase integration is
forbidden because it requires a Supabase secret API key.

## Work explicitly not authorized by this proposal

- creating any resource before owner acceptance and exact Supabase cost
  confirmation;
- production, public access, public Storage, custom production domain, real
  users/data/content, publication, distribution, or live providers;
- changing Strongr Daily;
- using development/disposable credentials or copying their data;
- broadening RLS, grants, Storage policies, service-role/browser access, MFA,
  tenant, audit, or human-governance authority;
- silently selecting a substitute provider, plan, region, name, or paid add-on.

## Acceptance recorded

On 2026-07-28, the owner explicitly accepted:

- [`ADR-0005`](../adr/ADR-0005-separate-staging-control-plane.md);
- the exact provider/resource table;
- the USD $25 expected and USD $35 hard monthly ceiling;
- the secret, host, worker, backup, telemetry, and solo-reviewer boundaries.

This acceptance still does not complete M4.1 or authorize Supabase project
creation without the separate provider-reported recurring-cost confirmation.
M4.1 completes only after the separate resources are created and the immutable
deployment, migration, isolation, rollback, secret-lifecycle, backup, telemetry,
evidence, and cleanup contracts pass.
