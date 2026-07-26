# M1.0 Application Foundation

## Status

Accepted on protected `main` through owner-approved PR #13 at commit
`58fdcd9d3ff9736faf505c776d03c4367b7dbd9a`. This stage creates application
boundaries only. It does not deploy an application, connect an external AI
provider, change the database, publish content, or modify Strongr Daily.

## Module boundaries

- `apps/studio` is the browser/operator boundary. It accepts only a Supabase
  publishable key, exposes tenant-scoped reads, and invokes typed governed
  commands. It contains no direct governed-table mutation API.
- `apps/worker` is the server-only durable-worker boundary. It is the only
  application module that accepts a Supabase secret or legacy service-role key.
- `packages/contracts` names the existing browser and worker database commands
  without turning database tables into the public application contract.
- `packages/content-schemas` is the single source for runtime validation,
  TypeScript types, and checked-in JSON Schema for the M1 brief and content
  payloads.
- `packages/ai` defines a provider-neutral generation boundary and the
  deterministic test adapter. The adapter emits synthetic drafts only and
  cannot review, approve, revoke, export, or publish.
- `packages/testing` contains stable, synthetic fixtures with two distinct
  organization identities for later tenant-isolation tests.

## Environment contract

Browser:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Worker:

- `STRONGR_OS_SUPABASE_URL`
- exactly one of `STRONGR_OS_SUPABASE_SECRET_KEY` or the transitional
  `STRONGR_OS_SUPABASE_SERVICE_ROLE_KEY`
- `STRONGR_OS_WORKER_ID`

No credential value is committed. The client boundary check scans Studio source
and built output for privileged environment names, backend imports, direct
mutation calls, and secret-key literals.

## CI and evidence

The `M1 application / foundation` check uses pinned Node and pnpm versions and
runs formatting, lint, strict type checking, generated-schema drift detection,
unit tests, build, and environment-boundary validation. Each check writes a
separate log plus a JSONL summary. The shared M1 workflow uploads the evidence
directory with `if: always()` so failed checks remain diagnosable.

Existing Database contract and M0.2 reliability checks continue to run on every
pull request. M1.0 adds no migration and does not alter their security proofs.

## Rollback

M1.0 is repository-only and has no runtime state. Revert the M1.0 merge commit
to remove the application workspace and CI check. No database rollback,
credential rotation, production operation, or Strongr Daily change is required.
