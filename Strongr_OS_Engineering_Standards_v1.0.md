# Strongr OS Engineering Standards

**Owner:** Strongr Society / Neil Gasson  
**Version:** 1.0  
**Date:** July 24, 2026  
**Status:** Approved working standard for M0 and future migrations

## 1. Purpose

These standards define how Strongr OS is built, changed, reviewed, tested, deployed, recovered, and governed. They ensure that the current Strongr Daily app remains protected; every production change is reproducible; organization data remains isolated; AI cannot approve or publish theological content; privileged actions are authorized server-side and audited; and failures are recoverable.

No implementation may bypass these standards without a written, time-limited exception approved by Neil.

## 2. Governing principles

1. GitHub is the canonical source of truth for code, migrations, contracts, prompts, tests, decisions, and runbooks.
2. PostgreSQL/Supabase is the canonical runtime data foundation.
3. Production is never a development workspace.
4. The current Strongr Daily app remains isolated and unchanged unless separately authorized.
5. Strongr OS begins as a modular monolith with durable asynchronous workers.
6. AI may assist; authorized humans approve.
7. Every public resource must trace to one approved immutable content version.
8. Every tenant-owned record must be organization-scoped.
9. Row Level Security is defense in depth, not the only enforcement mechanism.
10. Governed writes must pass through narrow server-side use cases or database procedures.
11. Sensitive data is minimized and excluded from general AI and analytics by default.
12. Every long-running or failure-prone operation must be durable, idempotent, retryable, observable, and recoverable.
13. Every production release requires a rollback or forward-repair plan.
14. Every backup strategy must be proven by a restore test.

## 3. Repository standard

Canonical repository: `neilgasson/strongr-os`

Required initial structure:

```text
strongr-os/
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
    CODEOWNERS
```

Rules:

- Default branch: `main`.
- Direct feature work on `main` is prohibited.
- Branch names:
  - `feat/<short-name>`
  - `fix/<short-name>`
  - `chore/<short-name>`
  - `docs/<short-name>`
  - `security/<short-name>`
- Pull requests must describe scope, data/contract changes, security/privacy impact, tests, deployment, and rollback.
- No secrets, tokens, passwords, private content, or service-role keys may be committed.
- Critical GitHub Actions should be pinned to full commit SHAs before production launch.

## 4. Environment standard

| Environment | Purpose | Allowed data |
|---|---|---|
| Local | Individual development | Synthetic fixtures only |
| Preview | Pull-request review | Ephemeral synthetic data |
| Development | Shared integration work | Synthetic/non-sensitive data |
| Staging | Release rehearsal | Realistic anonymized fixtures |
| Production | Approved live operation | Production data only |

Each environment must use separate Supabase, storage, worker, AI-provider, analytics, and monitoring credentials. Production credentials and production data must not be used outside production by default. Service-role credentials are server-only.

## 5. Migration standard

Migration files use UTC timestamps:

`YYYYMMDDHHMM_description.sql`

Example:

`202607241200_m0_platform_kernel.sql`

Rules:

- Every database change is represented by a migration file in Git.
- No production schema change is made only through the Supabase dashboard.
- Production migrations are append-only.
- Existing production migrations are never edited.
- Destructive changes use expand → migrate/backfill → contract.
- Backfills must be resumable, observable, and safe to retry.
- Every migration includes preconditions, verification, representative-volume testing when relevant, and rollback or forward-repair notes.
- A deployment lock must prevent concurrent schema releases.

SQL style:

- Lowercase snake_case names.
- UUID primary keys named `id`.
- Foreign keys named `<entity>_id`.
- Use `timestamptz`.
- Standard creation timestamp: `created_at timestamptz not null default now()`.
- Use `updated_at` only where legitimate mutation exists.
- Historical facts are append-only.
- Money uses integer minor units or fixed-precision numeric values, never floating point.
- Governed JSONB requires a named schema version, strict validation, size limits, and canonical hashing.

## 6. Identifier standard

- Stable UUIDs are internal identities.
- Titles, slugs, emails, filenames, and provider IDs are never primary identity.
- Slugs are navigation helpers only.
- External IDs are stored separately with provider context.
- Legacy IDs are retained in mapping tables during migration.

## 7. Tenant ownership and relational integrity

- Every tenant-owned root record includes `organization_id uuid not null`.
- Every tenant parent has `unique (id, organization_id)`.
- Tenant child relationships use composite foreign keys:
  `(parent_id, organization_id) → (id, organization_id)`.
- Cross-organization references are prohibited unless an explicit sharing model authorizes them.
- Reviewers, approvers, publishers, creators, and assignees must be active members of the same organization.
- Storage paths, jobs, logs, analytics, embeddings, and exports are organization-scoped.
- Cross-tenant negative tests are mandatory.

## 8. Profiles, memberships, roles, and permissions

- Supabase Auth is linked through the stable Auth subject UUID.
- Profiles do not use email as identity.
- Organization access is represented by memberships.
- Roles and permissions are separate.
- Stable permissions include:
  - `content.create`
  - `content.submit`
  - `review.scripture`
  - `review.theology`
  - `review.editorial`
  - `approval.grant`
  - `export.request`
  - `publication.schedule`
  - `publication.execute`
- Authorization is deny-by-default and server-enforced.
- UI visibility is never authorization.
- MFA/AAL2 is required for privileged roles before production-shaped use.

## 9. RLS and database privileges

- Enable RLS on every browser-exposed tenant table.
- RLS defaults to deny.
- Browser clients receive minimum required read access.
- Browser clients may not directly write governed records such as content versions, workflow transitions, review decisions, approval grants, AI/job records, exports, publication records, or audit events.
- Governed writes use narrow server-side use cases or transaction-safe database functions.
- Service-role use is restricted because it bypasses RLS.
- Every RLS policy and grant requires positive and negative integration tests.

## 10. Content identity and versioning

A `content_item` is the permanent identity of a resource.

A `content_version` is one exact authored revision.

Rules:

- Submitted versions are immutable.
- Version numbers are allocated atomically.
- Payloads are strictly validated.
- Trusted logic computes the payload hash using canonical serialization.
- A changed payload creates a new version.
- Approval attaches to one exact version and evidence bundle, never only to the content item.
- Rejected, superseded, or unapproved versions cannot be exported as approved.

The first content schema is `strongr.audio_reflection.v1`.

Every versioned payload includes a schema ID/version, strict runtime validation, deterministic hash, size limits, migration strategy, and golden fixtures.

## 11. Workflow and approval standard

Recommended lifecycle:

`brief → draft → evidence checks → human review → approval snapshot → production package`

Rules:

- Automated checks are evidence, not human approval.
- Scripture, theology/pastoral, and editorial decisions are separate.
- Review decisions reference the organization, membership/reviewer, exact version, review lane, decision, timestamp, and evidence.
- Approval references an immutable snapshot containing:
  - version ID and payload hash;
  - review-policy version;
  - exact review-decision IDs;
  - exact automated check run and check-definition versions;
  - Scripture source/translation verification;
  - rights snapshot;
  - approver identity and authentication assurance;
  - timestamp and reason.
- Relevant content, evidence, rights, or policy changes require explicit revocation or supersession.
- AI cannot grant Scripture, theological, editorial, final, export, or publication approval.
- Approval and workflow transitions must be transactional and concurrency-safe.

## 12. Audit standard

Audit records are append-only.

Every privileged action records actor profile/membership, organization, action, target, prior/new state when appropriate, correlation ID, source channel, timestamp, and reason or approval reference.

Application roles cannot update or delete audit history. Sensitive text, secrets, journal text, prayer text, and unnecessary AI prompts must not appear in audit payloads.

## 13. Durable jobs, events, and idempotency

Every AI, import, export, media, notification, transcription, or publication operation must:

- persist intent before execution;
- use an organization-scoped idempotency key and request fingerprint;
- record attempts and failures;
- distinguish transient and permanent errors;
- use bounded retries with backoff;
- avoid duplicate side effects;
- expose safe operator status;
- move unrecoverable work to a visible failure queue;
- preserve provider correlation IDs and costs.

Use a transactional outbox when database state must emit asynchronous work.

Idempotency uniqueness:

`unique (organization_id, operation, idempotency_key)`

## 14. AI engineering standard

AI output is an artifact, never approved canonical truth.

Every AI run records organization, actor, use case, content/version linkage, provider/model, prompt version/checksum, source snapshot IDs/hashes, structured input/output schema, provider response ID, attempts, usage, cost, latency, validation/safety results, artifact hash, and human disposition.

Rules:

- Use a provider-neutral interface.
- Prompt versions are immutable.
- Prompt deployment pointers are separate.
- One schema source generates runtime validation, TypeScript types, and JSON Schema.
- Structured output never replaces Scripture, theology, rights, pastoral, or human review.
- Private journals, prayers, care records, and children’s data are excluded by default.

## 15. API and contract standard

- Client APIs begin at `/api/v1`.
- Inputs and outputs are strictly schema-validated.
- Privileged writes call server-side domain use cases.
- Database tables are not the public API contract.
- AI and ML provider schemas are not the public contract.
- Breaking changes require a new version or a documented backward-compatible migration.
- Domain events use versioned names and payloads.

## 16. Security standard

Target OWASP ASVS 5.0.0 Level 2, with extra controls for privileged approval, publication, journals, prayers, and sensitive content.

Required controls include MFA/AAL2, secure session rotation/revocation, deny-by-default authorization, CSRF/origin protection, rate/concurrency limits, request/upload limits, secure headers, CSP, SSRF protection, secret scanning, dependency review, static analysis, prompt-injection handling, allowlisted tools/destinations, and no model-controlled authorization.

Critical/high unresolved findings block release unless Neil approves a documented, time-limited exception.

## 17. Privacy and sensitive data

| Class | Examples | Default |
|---|---|---|
| Public | Published content and metadata | Eligible after approval |
| Internal | Briefs and operational metrics | Staff by role |
| Confidential | Drafts, rights, unpublished media | Tenant-isolated |
| Highly sensitive | Journals, prayers, care/crisis information | Separate controls; excluded from general AI/analytics |

Consent must be specific, versioned, timestamped, and revocable where applicable. Highly sensitive text is excluded from general AI, embeddings, search indexing, analytics payloads, and shared-model improvement by default. No raw sensitive text appears in logs or audit events.

## 18. Testing standard

Required layers:

- unit;
- state-machine/domain;
- database constraints and migration;
- RLS/grant;
- cross-tenant negative;
- contract/schema;
- integration;
- end-to-end;
- security;
- accessibility;
- resilience/idempotency;
- AI golden/adversarial evaluation;
- migration rehearsal;
- backup restore.

Release is blocked by failed tenant isolation, missing server authorization, missing required approval, untraceable approved artifacts, failed migration rehearsal, failed required restore evidence, critical accessibility failure, unbounded retry/cost behavior, or inability to operate manually during AI-provider failure.

## 19. Accessibility standard

Target WCAG 2.2 AA.

Critical requirements include keyboard operation, visible focus, semantic structure, programmatic labels/errors, sufficient contrast, zoom/text resize, reduced motion, screen-reader status announcements, transcripts, captions where applicable, appropriate touch targets, and no essential meaning conveyed only by color.

## 20. Observability standard

Every request, job, AI run, and governed operation uses a correlation ID.

Required telemetry includes structured logs, error tracking, performance traces, database latency/errors, queue depth/age/retries/dead letters, AI cost/latency/validation/fallback, authentication/authorization anomalies, export/publication reconciliation, and uptime/health checks.

Logs redact secrets and sensitive content. Alerts have severity, owner, escalation path, and runbook.

## 21. Backup, recovery, and rollback

Before production-shaped use:

- define RPO and RTO;
- configure database backups or approved equivalent;
- maintain a separate storage-object inventory and recovery procedure;
- test a full staging restore;
- reconcile database asset metadata against stored objects;
- preserve source commits and deployment configuration;
- run restore drills quarterly at first.

A backup is not accepted until restoration succeeds.

## 22. CI/CD standard

Every pull request runs reproducible install, formatting, lint, typecheck, unit tests, schema validation, build, migration checks, relevant database/RLS integration tests, dependency review, secret scanning, static analysis, and accessibility/end-to-end checks for critical workflows.

Deployment rules:

- build once and promote the same artifact;
- use immutable source commits;
- require staging acceptance;
- create a named release and rollback point;
- run production smoke tests;
- stop or recover when thresholds fail.

Automatic production deployment is not enabled during M0.

## 23. Documentation and ADRs

Architecture Decision Records use:

`docs/adr/ADR-XXXX-short-title.md`

Each ADR records context, decision, alternatives, consequences, owner, date, and status.

Required living documentation includes architecture boundaries, data dictionary, content schemas, authorization matrix, threat models, incident runbooks, backup/restore runbook, migration procedures, provider outage procedure, and change log.

## 24. Definition of done

A change is done only when code and migrations are version-controlled; contracts and documentation are updated; authorization is server-enforced; tenant integrity is preserved; tests pass; accessibility/security/privacy are addressed; observability exists; failure/recovery are defined; staging acceptance is recorded; and rollback or forward repair is documented.

No change may modify the current Strongr Daily app without separate authorization.

## 25. Immediate M0 application

These standards govern the next implementation steps:

1. Establish GitHub source authority.
2. Add repository protections and CI foundations.
3. Create the M0 platform-kernel migration in Git.
4. Review the migration before execution.
5. Establish server-controlled governed writes.
6. Add relational tenant-integrity constraints.
7. Add RLS and grant tests.
8. Configure privileged MFA.
9. Add observability and budget safeguards.
10. Record backup and restore evidence.

No M1 feature implementation proceeds until the M0 kernel acceptance requirements are met.

## 26. Approval statement

> I approve Strongr OS Engineering Standards v1.0 as the governing implementation standard for M0 and future Strongr OS work. These standards do not authorize changes to the current Strongr Daily app or deployment of later milestones.
