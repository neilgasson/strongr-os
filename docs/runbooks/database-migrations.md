# Database Migration Runbook

## Preconditions

- Target is the isolated Strongr OS environment, never the current Strongr
  Daily database.
- Source commit and migration checks are green.
- A database backup or disposable clean environment is available.
- No concurrent migration is running.
- The executing operator has verified the project reference.

## Development rehearsal

```bash
npx --yes supabase@2.109.1 start
npx --yes supabase@2.109.1 db reset --local
npx --yes supabase@2.109.1 test db
```

## Deployment order

Apply committed migrations in timestamp order. Do not paste selected fragments
into the dashboard and do not edit a migration after it has reached a persistent
environment.

Current order:

1. `202607241230_m0_governed_platform_kernel.sql`
2. `202607241330_m1_governed_audio_reflection.sql`
3. `202607242230_m1_restrict_check_worker_execute.sql`
4. `202607251200_m0_2_reliability_primitives.sql`
5. `202607251230_m0_2_request_idempotency_fingerprint.sql`

The third migration is the forward repair for the observed remote worker-RPC
privilege discrepancy. Its postcondition is exactly:

- `anon=false`
- `authenticated=false`
- `service_role=true`

After M0/M1 migration, a database administrator may call
`app_private.bootstrap_first_owner(...)` once, using the existing Supabase Auth
user UUID. Do not commit the UUID or credentials.

Create the first active review policy through
`public.m1_create_review_policy(...)` after the owner is signed in with AAL2.

## Verification

- Run `supabase test db`.
- Confirm `anon` and `authenticated` have no table write privileges.
- Confirm cross-tenant negative tests pass.
- Confirm the owner can read only their organization.
- Confirm privileged commands fail at AAL1.
- Confirm no Strongr Daily project, database, domain, or deployment changed.
- Run `scripts/acceptance/rehearse_migration_failure.sh`.
- Run `scripts/acceptance/rehearse_forward_repairs.sh` against a disposable
  local database only.
- Confirm `m0_operational_health()` returns `status=ok`.

The forward-repair replay deliberately reproduces the worker privilege
discrepancy, applies the exact repair twice, replays the request-fingerprint
repair twice, and verifies the final privileges and fingerprint definition.
Never run that rehearsal against a remote project.

## Failure and recovery

Every migration is transactional. A pre-commit failure rolls back.
After a persistent environment has committed a migration, use a new
forward-repair migration. Never rewrite migration history.

Production-shaped use remains blocked until backup restoration has been tested
and recorded separately, including any future Storage objects.

See `docs/runbooks/backup-restore.md` for the disposable restore drill.
