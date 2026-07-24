# M0 Governed Platform Kernel — Review Checklist

**Migration:** `202607241230_m0_governed_platform_kernel.sql`  
**Status:** Draft for review — do not run yet

## Scope check

This migration creates only:

- organizations
- profiles
- memberships
- permissions
- roles
- role_permissions
- membership_roles
- feature_flags
- idempotency_keys
- outbox_events
- audit_events
- authorization helper functions
- read-only browser RLS policies
- privilege hardening
- stable permission seeds

It does not create M1 content, AI, review, approval, export, publication, recommendation, journal, prayer, or Strongr Daily 2.0 tables.

## Required review questions

- [ ] Is the Supabase project confirmed to be the separate `strongr-os-dev` project?
- [ ] Is no current Strongr Daily database connection involved?
- [ ] Does every tenant-owned child use organization-scoped relational constraints?
- [ ] Are browser write grants absent?
- [ ] Are governed writes reserved for later server use cases/database procedures?
- [ ] Are audit events append-only from the application perspective?
- [ ] Are idempotency and outbox tables hidden from browser roles?
- [ ] Are roles separate from permissions?
- [ ] Is Supabase Auth UUID the profile identity?
- [ ] Are email addresses excluded as record identity?
- [ ] Are RLS policies read-only and deny-by-default?
- [ ] Have migration syntax and integration tests been prepared before execution?
- [ ] Has a forward-repair approach been documented?
- [ ] Is this migration committed to GitHub before it is run?

## Known review note

The migration intentionally does not bootstrap Neil's owner membership or assign roles. That must be handled through a separate, reviewed bootstrap procedure after an Auth user exists.

## Execution boundary

Do not paste or run this migration in Supabase until:

1. it is uploaded to `supabase/migrations/`;
2. it has been reviewed;
3. the duplicate/incorrect-table checks have passed;
4. an explicit owner approval to execute has been recorded.
