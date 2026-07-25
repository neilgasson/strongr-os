# M0.2 Reliability and Operational Proof

## Status

M0.2 is an acceptance gate for the approved M0/M1 foundation. It adds
operational proof, not product capability. The current Strongr Daily
application and its Supabase project are outside this scope.

The immutable implementation baseline is:

`ca26e554893643a3975b979089c78505001be13a`

The M0.2 changes must remain on the draft pull-request branch until Neil
approves merge.

## Acceptance matrix

| Gate | Automated evidence | Passing condition |
|---|---|---|
| Original contract | `000_m0_m1_database_contract.sql` | All original 17 assertions pass unchanged |
| Worker repair | `110_m0_2_outbox_reliability.sql` | `anon=false`, `authenticated=false`, `service_role=true` |
| Tenant isolation | `100_m0_2_tenant_aal_governed_e2e.sql` and remote runner | Each real user sees only its organization; cross-tenant RPC, inactive membership, and revoked-role access fail |
| AAL | SQL JWT simulation and remote TOTP runner | Same privileged command fails at AAL1 or without current assurance and succeeds at AAL2 |
| Governed path | `100_m0_2_tenant_aal_governed_e2e.sql` and remote runner | Brief through immutable production package succeeds with complete evidence |
| Idempotency | `120_m0_2_idempotency_contract.sql`, `run_m0_2_concurrency.sh`, and remote runner | Eight concurrent exact calls return one job and one outbox event; changed requests using the key are denied |
| Outbox reliability | `110_m0_2_outbox_reliability.sql`, concurrency runner, and remote runner | Concurrent leasing, retry, crash recovery, stale-token rejection, duplicate acknowledgement, poison-message dead letter, and operator visibility pass |
| Migration repair | `rehearse_migration_failure.sh` and `rehearse_forward_repairs.sh` | Failed transaction leaves no partial state; both real forward repairs replay twice and verify |
| Backup/restore | `rehearse_backup_restore.sh` | Archive checksum verifies; critical row counts and commands match |
| Health/metrics | health and metrics scripts | No expired leases, dead letters, stale workers, or aged backlog |
| Repository control | `verify_github_protection.sh` | Private repo, PR review, CODEOWNERS, strict required checks, no force/delete |

## Local gate

Prerequisites:

- Docker Desktop or Docker Engine
- Node.js 20 or later
- PostgreSQL client tools
- Bash and Python 3

Run:

```bash
scripts/acceptance/run_m0_2_local.sh
```

The runner starts an isolated local Supabase stack, applies every migration
from zero, runs all pgTAP files, races concurrent duplicate commands,
rehearses a failed migration and forward repair, checks health, and writes
versioned evidence logs. It never links a remote project.

## Real `strongr-os-dev` gate

The remote runner is intentionally locked. It will run only when:

```text
STRONGR_OS_REMOTE_ACCEPTANCE=strongr-os-dev
```

It creates two random temporary Auth users and organizations, uses real
email/password AAL1 sessions, enrolls and verifies a temporary TOTP factor,
executes the governed path, tests concurrent idempotency and outbox recovery,
then removes the fixtures.

Required environment variables:

- `STRONGR_OS_SUPABASE_URL`
- `STRONGR_OS_SUPABASE_ANON_KEY`
- `STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY`
- `STRONGR_OS_DATABASE_URL`
- `STRONGR_OS_REMOTE_ACCEPTANCE=strongr-os-dev`

Run:

```bash
python3 scripts/acceptance/run_remote_supabase_acceptance.py \
  | tee m0-2-remote-acceptance.jsonl
```

Never commit, paste into chat, or store any key or database URL in an
evidence file. The runner emits no secrets.

## Required GitHub checks

The `main` protection rule must require:

- `Database contract / test`
- `M0.2 reliability proof / acceptance`

Both checks must pass on the latest pull-request commit. M0.2 is not accepted
from a check that ran only against an earlier commit.

## Acceptance boundary

M0.2 may be marked complete only after:

1. Local and GitHub gates pass.
2. The real `strongr-os-dev` runner passes.
3. A disposable backup restore passes within the stated recovery target.
4. GitHub protection verification passes.
5. The acceptance record contains exact commit, PR, environment, timestamps,
   artifact hashes, and reviewer sign-off.

Do not merge, connect Strongr Daily, enable live AI, publish, add billing, add
recommendations, or onboard an external organization as part of this gate.
