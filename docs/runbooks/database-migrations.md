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

## Failure and recovery

Both initial migrations are transactional. A pre-commit failure rolls back.
After a persistent environment has committed a migration, use a new
forward-repair migration. Never rewrite migration history.

Production-shaped use remains blocked until backup restoration has been tested
and recorded separately, including any future Storage objects.
