# M1 — Governed Audio-Reflection Application Slice

- **Status:** Proposed
- **Date:** July 26, 2026
- **Owner:** Neil Gasson / Strongr Society
- **Approval gate:** Repository-owner approval is required before implementation begins.

## Entry condition

M0.2 is accepted. The canonical evidence record is stored at
evidence/m0-2/acceptance-record.json, and the protected main branch contains
the tested M0/M1 database foundation.

Approval of this document authorizes implementation planning and protected M1
implementation pull requests. It does not authorize deployment, publication,
production acceptance, or any change to the current Strongr Daily application.

## Purpose

M1 will prove one governed Strongr OS application slice for an audio-reflection
package. It will exercise the existing database commands and reliability
primitives through a new operator application and a durable server-side worker.

The slice ends at an immutable production-package manifest. Human authority is
retained for Scripture, theology, editorial review, rights evidence, approval,
revocation, export, and any future publication decision.

## Governed workflow

1. An authorized operator creates an audio brief.
2. The operator requests generation with a complete idempotency fingerprint.
3. A server-side worker claims the durable outbox event with a tokenized lease.
4. A provider-neutral adapter produces a draft and records attempt provenance.
5. The draft is stored as an immutable version and submitted for review.
6. Versioned automated checks are recorded by the worker boundary.
7. Authorized humans record Scripture, theology, editorial, and rights evidence.
8. An AAL2-authorized human approves the exact version and evidence snapshot.
9. Strongr OS creates an immutable production-package manifest.
10. The workflow stops. M1 does not publish or modify Strongr Daily.

## In scope

- A new Strongr OS operator application boundary under apps/studio.
- A durable server-side worker boundary under apps/worker.
- Shared typed contracts and content schemas under packages.
- A deterministic test adapter before any external AI-provider adapter.
- Provider-neutral generation intent, attempt provenance, retry, and recovery.
- Tenant-scoped reads and narrow governed database commands.
- Human review lanes, Scripture evidence, rights snapshots, AAL2 approval,
  revocation, and immutable package-manifest creation.
- Accessibility, privacy, structured logs, metrics, failure evidence, and
  recovery instructions for the new slice.
- Non-production remote acceptance against Strongr OS environments.

## Trust and security boundaries

- Supabase/PostgreSQL remains the canonical runtime data foundation.
- Browser clients receive tenant-filtered reads and narrow command execution,
  never direct writes to governed tables.
- Data API exposure is explicit and verified. RLS remains defense in depth and
  does not replace server-enforced workflow authorization.
- The service role is available only to the server-side worker and CI fixtures.
  It is never exposed to browser code, public environment variables, logs, or
  downloadable artifacts.
- New public-schema objects require explicit exposure review, least-privilege
  grants, tenant-integrity checks, and RLS where applicable.
- SECURITY DEFINER functions are not added to bypass permission failures. Any
  privileged function requires explicit threat review, fixed search paths,
  authentication checks, revoked PUBLIC execution, and exact role grants.
- Privileged human actions require current organization membership, permission,
  and AAL2 assurance.
- AI and automated checks may create draft evidence only. They cannot approve,
  revoke, export, or publish.

## Out of scope

- Changes to the current Strongr Daily application or its production systems.
- Publication tables, publishing commands, or automatic production deployment.
- ElevenLabs, artwork generation, storage-bucket automation, or media delivery.
- Recommendation, personalization, engagement, journal, prayer, billing,
  external-organization, family, or child features.
- Replacing the governed database commands with direct browser writes.
- Weakening RLS, permissions, audit evidence, or service-role boundaries.
- Treating the existing Strongr Studio prototype as the production foundation.

## Delivery sequence

Each stage is delivered through a small protected pull request with the required
Database contract and M0.2 reliability checks on its current head.

1. **M1.0 — Application foundation:** module skeletons, typed contracts,
   environment boundaries, deterministic fixtures, and CI foundations.
2. **M1.1 — Durable worker:** outbox consumption, tokenized leases, idempotent
   generation attempts, retry/dead-letter behavior, and structured evidence.
3. **M1.2 — Brief-to-draft operator flow:** tenant-scoped brief creation,
   generation request, draft version creation, and submission.
4. **M1.3 — Review-to-package flow:** automated checks, human review lanes,
   Scripture and rights evidence, AAL2 approval/revocation, and manifest creation.
5. **M1.4 — Acceptance:** local and remote end-to-end proof, failure/recovery
   rehearsal, observability evidence, accessibility checks, and final record.

No later stage begins until the preceding stage is accepted. Schema changes, if
needed, require a separately reviewed migration created and tested through the
existing migration discipline.

## Acceptance matrix

| Gate | Required proof |
| --- | --- |
| M1 entry | The accepted M0.2 record is present on protected main. |
| Repository isolation | The current Strongr Daily files and systems are unchanged. |
| Tenant isolation | Two-organization tests prove reads and commands cannot cross tenants. |
| Anonymous denial | Anonymous callers cannot invoke governed M1 commands. |
| Browser boundary | Browser roles cannot write governed tables directly. |
| Data API exposure | Every exposed object and role grant is explicit, reviewed, and tested. |
| Service-role boundary | The credential exists only in worker/CI server contexts and is absent from client bundles and artifacts. |
| Idempotency | Concurrent equivalent requests create one generation job and one outbox event; changed payload reuse is denied. |
| Worker leasing | Concurrent workers receive unique claims and lease tokens; stale leases recover safely. |
| Failure recovery | Transient retry, crash recovery, poison-message visibility, and forward repair are rehearsed. |
| Version integrity | Submitted content, hashes, schemas, identity, and authorship cannot be changed in place. |
| Human governance | Required review lanes, Scripture evidence, and rights snapshots are bound to the exact version. |
| AAL2 approval | Real AAL1 denial and AAL2 success are proven for approval and package creation. |
| Revocation | Revoked approval cannot authorize a new production package. |
| Package integrity | The immutable manifest names the exact approved version, evidence, policy, and hashes. |
| Observability | Structured logs, health, metrics, retry/dead-letter visibility, and actionable runbooks exist. |
| Evidence on failure | Acceptance artifacts and cleanup run even when a preceding step fails. |
| Accessibility and privacy | Operator flows pass defined accessibility checks and expose no credentials or unnecessary personal data. |
| Remote acceptance | A non-production run records exact commit, PR, environment, job, artifact, migration, and recovery identifiers. |
| Owner acceptance | Neil explicitly approves the final M1 acceptance record before merge or promotion. |

## Definition of done

M1 is complete only when every acceptance gate passes on the exact protected
head, a non-production remote acceptance record is committed, all required
checks are green, failure and recovery evidence is preserved, and the repository
owner explicitly approves completion.

M1 completion still does not authorize publication, production deployment, or
changes to the current Strongr Daily application.
