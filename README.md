# Strongr OS

Strongr OS is the governed operating platform for the Strongr Society ecosystem.

It will provide the shared foundation for:

- Strongr Studio
- Strongr Daily 2.0
- Strongr Library
- Strongr Trust
- Strongr Flow
- Strongr Guide
- Strongr Insights
- Future Strongr Society products

## Current phase

**M0.2 reliability and operational proof**

The repository now contains the hardened M0 platform-kernel migration and the
M1 governed audio-reflection migration, database-contract tests, CI validation,
an authorization matrix, a data dictionary, a threat model, and a migration
runbook. M0.2 adds the forward worker-permission repair, tokenized outbox
leases, retry/dead-letter recovery, immutable delivery receipts, health and
metrics, complete generation-request idempotency fingerprints, real Auth
acceptance automation, concurrency tests, recovery drills, and a second
required CI check.

## Current implementation boundary

The current Strongr Daily application must remain unchanged during the parallel Strongr OS build.

The existing Strongr Studio and M1 checkpoints are design and workflow references only. They are not the production foundation.

## Governing rules

- GitHub is the source of truth for code, migrations, contracts, prompts, tests, decisions, and runbooks.
- Supabase/PostgreSQL is the canonical runtime data foundation.
- AI may assist with drafting and checks; authorized humans retain theological, editorial, approval, export, and publishing authority.
- Tenant isolation, authorization, auditability, accessibility, recovery, and privacy are release requirements.
- No database migration is executed before it is reviewed and committed.
- No M1 implementation continues until the M0 acceptance requirements are met.

## Repository structure

```text
apps/
  studio/
  worker/
packages/
  domain/
  database/
  auth/
  contracts/
  content-schemas/
  ai/
  observability/
  testing/
  design-system/
supabase/
  migrations/
  seed/
  tests/
docs/
  adr/
  architecture/
  data-dictionary/
  threat-models/
  runbooks/
  standards/
.github/
  workflows/
scripts/
  acceptance/
  ops/
ops/
  monitoring/
evidence/
  m0-2/
```

## Status

M0/M1 is implemented and M0.2 acceptance evidence is prepared for controlled
execution. These files do not authorize merge, deployment, publication,
production acceptance, or any change to the current Strongr Daily app.
