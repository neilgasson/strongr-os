# M0 — Governed Platform Kernel

## Purpose

M0 establishes the secure and recoverable platform foundation required before M1 continues.

## In scope

- Private GitHub-owned source
- Repository and module foundation
- Environment separation
- Supabase/PostgreSQL migration discipline
- Organization, identity, membership, role, and permission kernel
- Relational tenant integrity
- Server-controlled governed writes
- RLS as defense in depth
- Immutable version and approval evidence patterns
- Transactional workflow primitives
- Audit foundations
- Idempotency and outbox foundations
- CI and integration-test foundations
- MFA for privileged roles
- Observability foundations
- Backup and restore evidence

## Out of scope

- Publishing to the current Strongr Daily app
- Strongr Daily 2.0 screens
- Recommendation ML
- ElevenLabs automation
- Artwork generation
- External organizations
- Billing
- Public user accounts
- Family or child features
- Production publication workflows

## Exit criteria

M0 is complete only when:

- source and migration authority are established in GitHub;
- cross-tenant integrity tests pass;
- privileged writes are server-controlled;
- review and approval evidence cannot be bypassed;
- migrations are repeatable;
- CI gates pass;
- privileged MFA is configured;
- observability is active;
- a staging restore drill succeeds;
- Neil approves M0 completion.
