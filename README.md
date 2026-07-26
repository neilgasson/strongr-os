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

**M1.0 implementation — governed application foundation**

M0.2 reliability and operational acceptance completed on July 26, 2026. The
canonical record at evidence/m0-2/acceptance-record.json binds the accepted
remote, migration, recovery, reliability, governance, and artifact evidence to
exact identifiers.

The repository contains the hardened M0 platform kernel, the governed M1
audio-reflection database foundation, and the accepted M0.2 reliability proof.
The repository owner approved the M1 application scope through PR #12. M1.0 is
limited to module skeletons, typed contracts, environment boundaries,
deterministic fixtures, and CI foundations.

## Current implementation boundary

The current Strongr Daily application must remain unchanged during the parallel Strongr OS build.

The existing Strongr Studio and M1 checkpoints are design and workflow references only. They are not the production foundation.

## Governing rules

- GitHub is the source of truth for code, migrations, contracts, prompts, tests, decisions, and runbooks.
- Supabase/PostgreSQL is the canonical runtime data foundation.
- AI may assist with drafting and checks; authorized humans retain theological, editorial, approval, export, and publishing authority.
- Tenant isolation, authorization, auditability, accessibility, recovery, and privacy are release requirements.
- No database migration is executed before it is reviewed and committed.
- M1 implementation remains inside the explicitly approved scope and protected
  delivery sequence.

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

The M0/M1 database foundation and M0.2 acceptance are complete. M1 scope is
approved for protected implementation, beginning with M1.0. This approval does
not authorize deployment, publication, production acceptance, or any change to
the current Strongr Daily application.
