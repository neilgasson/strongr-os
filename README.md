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

**M3 accepted — owner-only non-production Strongr Studio preview**

M0.2 reliability and operational acceptance completed on July 26, 2026. The
canonical record at evidence/m0-2/acceptance-record.json binds the accepted
remote, migration, recovery, reliability, governance, and artifact evidence to
exact identifiers.

The repository contains the hardened M0 platform kernel, the governed M1
audio-reflection database foundation, and the accepted M0.2 reliability proof.
The repository owner approved the M1 application scope through PR #12 and
accepted M1.0 through PR #13 at commit
`58fdcd9d3ff9736faf505c776d03c4367b7dbd9a`, then accepted the durable M1.1
worker through PR #14 at commit
`da6418a793b244afa973cfecaa69a797cf41bc2c`, and accepted the M1.2 governed
brief-to-draft flow through PR #15 at commit
`a960262d09a011cb443c52cb3505c84763a1d8af`, and accepted the M1.3 governed
review-to-package flow through PR #16 at commit
`64863271187dd02ca357a6b41bc854c4106c6640`. M1.4 was accepted through PR #17
at commit `fbd4fef747a53c69622a5aed33322e5008bacf6d`. The canonical record at
`evidence/m1/acceptance-record.json` binds the local, non-production remote,
migration, failure/recovery, governance, accessibility/privacy, and artifact
evidence to exact identifiers. PR #18 committed that final record to protected
`main` at `935adb08cd3f2f291facf3dfb986b8c7741bc666`.

The repository owner approved the M2 scope in PR #19 at
`adeef0bff9e804e808a5e6e61beb4e832578072b`, accepted M2.0 through PR #20
at `a07a258db216309d7667a9a8f52fdd6c966b492f`, accepted M2.1 through PR #21
at `9bae01e039e575c5a2e7eb6308d680a6586eb96c`, and accepted M2.2 through PR
#22 at `d55dc9cc383d44c3a6fed81b2ec41827dcd431e2`. M2.3 was accepted through
PRs #23 and #24 at `5df45797bc5502030982b182d2adeb8be54dd7ff`.
`evidence/m2/acceptance-record.json` binds the clean local replay,
non-production remote acceptance, complete object/database inventory,
independent encrypted byte backup, exact restore and reconciliation proof,
measured recovery time, failure artifacts, and governance evidence to exact
identifiers. Publication and production deployment remain deferred.

The repository owner accepted M3 through PRs #27–#37. Strongr Studio now
provides an authenticated, tenant-scoped browser workflow from brief through
private checksum-verified media, human review, immutable non-public staging, and
revocation. The owner-only preview is deployed against isolated
`strongr-os-dev`; `evidence/m3/acceptance-record.json` binds the implementation,
deployment, security, CI, artifact, and owner-approval evidence. All six
M0.2–M3 checks are strict required checks on protected `main`.

M4 is owner-approved and begins with production-readiness architecture and
operational threat modeling before any staging resource, live provider, or
production launch.

## Current implementation boundary

The current Strongr Daily application must remain unchanged during the parallel Strongr OS build.

The existing Strongr Studio and M1 checkpoints are design and workflow references only. They are not the production foundation.

## Governing rules

- GitHub is the source of truth for code, migrations, contracts, prompts, tests, decisions, and runbooks.
- Supabase/PostgreSQL is the canonical runtime data foundation.
- AI may assist with drafting and checks; authorized humans retain theological, editorial, approval, export, and publishing authority.
- Tenant isolation, authorization, auditability, accessibility, recovery, and privacy are release requirements.
- No database migration is executed before it is reviewed and committed.
- M2 implementation may begin only after its proposed scope and gates are
  explicitly approved and remains inside the protected delivery sequence.

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
  media/
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
  m1/
  m2/
  m3/
```

## Status

M0–M3 are complete and recorded. Strongr OS has an accepted governed
audio-content platform, durable generation and media workers, private Storage,
review and staging controls, recovery evidence, and an owner-only authenticated
Strongr Studio preview. This does not authorize public Storage, browser object
upload, publication, production deployment, external media or AI providers, or
any change to the current Strongr Daily application.
