# M2 — Governed Media Artifacts and Release Staging

- **Status:** Proposed
- **Date:** July 26, 2026
- **Owner:** Neil Gasson / Strongr Society
- **Approval gate:** Repository-owner approval is required before implementation begins.

## Entry condition

M1 is accepted. The canonical record is stored at
`evidence/m1/acceptance-record.json`, and PR #18 committed that record to
protected `main` at
`935adb08cd3f2f291facf3dfb986b8c7741bc666`.

Approval of this document authorizes implementation planning and protected M2
implementation pull requests. It does not authorize publication, production
deployment, a public Storage bucket, a live media or AI provider, or any change
to the current Strongr Daily application.

## Purpose

M2 will prove one governed media-artifact slice after the immutable M1
production-package manifest. It will create, validate, store, review, restore,
and privately stage one synthetic audio artifact while preserving exact package
identity, tenant isolation, human authority, and recovery evidence.

The slice ends at an immutable, non-public staged release bundle. Publication
remains a separate future milestone.

## Governed workflow

1. An AAL2-authorized operator requests media creation for one exact,
   unrevoked M1 production package.
2. A governed command persists the organization-scoped request fingerprint and
   durable outbox intent before any object operation.
3. A server-side worker claims only the media event through the accepted
   tokenized-lease contract.
4. A provider-neutral deterministic adapter creates a synthetic audio fixture;
   no external text-to-speech, artwork, or AI provider is called.
5. The worker validates the actual bytes, allowed media type, codec, size,
   duration, output-spec version, provenance, and SHA-256 before storage.
6. The worker writes once to a private, organization-scoped object path through
   the Supabase Storage API, then records immutable canonical artifact metadata.
7. Reconciliation detects and safely handles an object upload without a
   database commit, a database record without an object, retry after an
   ambiguous response, and checksum mismatch.
8. An authorized human records media-quality and transcript/accessibility
   evidence against the exact artifact.
9. An AAL2-authorized human creates an immutable, non-public staged release
   bundle binding the package, artifact, checksums, evidence, and configuration.
10. Object bytes and metadata are exported and restored into a disposable
    environment, every checksum and access boundary is re-verified, and the
    workflow stops before publication.

## In scope

- Append-only media intent, attempt, artifact, review, staging, and revocation
  records introduced through separately reviewed migrations.
- Narrow governed commands and explicit permissions for media request, review,
  staging, and revocation.
- One private Strongr OS media bucket in isolated local and development
  environments, configured reproducibly and never shared with Strongr Daily.
- Opaque, organization-scoped, write-once object paths; titles, emails, and
  private content never become path components.
- A deterministic synthetic audio adapter and golden media fixtures before any
  live provider integration.
- Durable worker execution, complete request fingerprints, bounded retries,
  stable provider-neutral correlation IDs, cost fields, and dead-letter
  visibility.
- Byte-level media validation, SHA-256 integrity, exact package linkage, and
  immutable staged release manifests.
- Tenant-scoped private retrieval for an exact artifact, with no browser
  upload, overwrite, delete, or unrestricted bucket listing.
- Media-quality, transcript, and accessibility evidence recorded by authorized
  humans and bound to the exact artifact.
- Object inventory, independent encrypted byte backup, disposable restore,
  missing/orphan reconciliation, and measured recovery time.
- Local and non-production remote acceptance with evidence uploaded even when
  a preceding step fails.

## Supabase platform constraints

These constraints were verified against current Supabase documentation on
July 26, 2026:

- Data API grants and RLS are separate controls. Every new exposed database
  object requires explicit least-privilege grants and tested RLS; M2 does not
  assume new public tables are exposed automatically.
- Supabase Storage denies operations until policies allow them. The M2 bucket
  remains private and every allowed operation is explicit and tenant-tested.
- The managed `storage` schema is treated as read-only. Object upload, copy,
  move, and deletion use the Storage API rather than direct metadata writes.
- Service-key uploads do not provide a trustworthy tenant owner identity.
  Authorization therefore binds canonical Strongr OS artifact metadata and
  organization-scoped paths; it never relies on `storage.objects.owner_id`
  alone.
- Supabase Storage does not provide S3 object versioning, and deletion is
  permanent. M2 uses unique write-once paths, denies overwrite/delete to
  application roles, records checksums, and proves an independent byte restore.
- Database backups contain Storage metadata but not object bytes. The object
  inventory and byte backup are independent, required release evidence.

References:

- <https://supabase.com/docs/guides/api/securing-your-api>
- <https://supabase.com/docs/guides/storage/security/access-control>
- <https://supabase.com/docs/guides/storage/security/ownership>
- <https://supabase.com/docs/guides/storage/schema/design>
- <https://supabase.com/docs/guides/storage/s3/compatibility>
- <https://supabase.com/docs/guides/platform/backups>

## Trust and security boundaries

- Supabase/PostgreSQL remains the canonical authority for artifact identity,
  tenant ownership, workflow state, authorization, and immutable evidence.
- Storage contains bytes, not authorization truth. An object is never eligible
  for staging unless its database artifact record binds the exact organization,
  package, path, checksum, media specification, and successful validation.
- Browser clients receive no Storage mutation capability and no direct writes
  to governed M2 tables.
- The service role remains available only to the server-side worker and
  acceptance fixtures. It is never placed in Studio code, public environment
  variables, logs, signed artifacts, or downloadable evidence.
- Cross-system database and object operations are not represented as one
  transaction. Explicit intermediate states, idempotent keys, write-once paths,
  and reconciliation make partial failure visible and recoverable. No Storage
  API call occurs while a database transaction holds locks.
- Every tenant-owned relationship uses the accepted composite organization key
  pattern. Foreign-key columns and columns used by RLS membership checks are
  indexed and verified before remote acceptance.
- New public-schema objects require explicit exposure review, tenant-integrity
  constraints, RLS where applicable, revoked default access, and exact grants.
- Privileged functions are not introduced to bypass permissions. Any
  `SECURITY DEFINER` function requires a fixed search path, in-body identity and
  authorization checks, revoked PUBLIC execution, exact role grants, and
  positive and negative tests.
- Current organization membership and permission are re-evaluated inside every
  governed command. Media request, staging, and revocation require AAL2.
- Automated validation and adapters may create artifact evidence only. They
  cannot approve media quality, stage a release, revoke authority, or publish.

## Out of scope

- Any file, database, Auth, Storage, domain, deployment, or secret belonging to
  the current Strongr Daily application.
- Public buckets, public object URLs, CDN publication, publication tables,
  scheduling, distribution, feeds, notifications, or production deployment.
- ElevenLabs, live text-to-speech, external AI, artwork generation, licensed
  music, or any paid provider.
- User uploads, browser-side Storage mutation, direct writes to managed Storage
  metadata, object replacement, or destructive cleanup presented as recovery.
- A production or publicly deployed visual Studio interface. M2 remains a
  governed application-contract and worker slice.
- Recommendation, personalization, engagement, playback analytics, journal,
  prayer, billing, external-organization, family, or child features.
- Weakening RLS, permissions, audit evidence, AAL2, immutable evidence, or the
  service-role boundary.

## Delivery sequence

Each stage is delivered through a small protected pull request with every
existing required check on its current head. No later stage begins until the
preceding stage is owner-accepted.

1. **M2.0 — Media and Storage foundation:** approved data model and migration,
   typed contracts, private-bucket configuration, explicit grants/policies,
   synthetic fixtures, threat-model update, and CI boundary checks.
2. **M2.1 — Durable synthetic-media worker:** provider-neutral adapter,
   byte validation, write-once upload, artifact recording, retry/dead-letter,
   idempotency, and partial-failure reconciliation.
3. **M2.2 — Review and release staging:** exact artifact retrieval, human media
   and accessibility evidence, AAL2 staging/revocation, and immutable staged
   release bundles.
4. **M2.3 — Recovery and acceptance:** byte inventory, independent backup,
   disposable restore, object/database reconciliation, local and remote
   end-to-end proof, failure artifacts, observability, and final M2 record.

Schema, role, or Storage-policy changes require a separately reviewed migration
or supported configuration artifact. Existing migrations and accepted remote
history are never edited or replayed over populated objects.

## Acceptance matrix

| Gate | Required proof |
| --- | --- |
| M2 entry | The accepted M1 record and closure commit are present on protected `main`. |
| Repository isolation | The current Strongr Daily files, systems, and environments are unchanged. |
| Package authority | Only an exact, unrevoked M1 production package can authorize media intent. |
| Schema integrity | Composite tenant foreign keys, supporting indexes, immutable constraints, and advisor checks pass. |
| Tenant integrity | Database references, object paths, reads, commands, and recovery cannot cross organizations. |
| Anonymous denial | Anonymous callers cannot read private media or invoke governed M2 commands. |
| Browser boundary | Browser roles cannot upload, overwrite, delete, or directly write governed records. |
| Data API exposure | Every new object and role grant is explicit, least-privilege, and positively and negatively tested. |
| Private Storage | The bucket is private; exact-asset retrieval works only for an authorized tenant member and bucket listing is restricted. |
| Service-role boundary | The secret remains worker/CI-only and is absent from Studio, bundles, logs, and artifacts. |
| Storage API boundary | Object mutation uses supported Storage APIs; managed metadata is not directly mutated. |
| Media validation | Actual bytes, type, codec, size, duration, spec version, and checksum are allowlisted and verified. |
| Object immutability | Unique paths, no overwrite, immutable metadata, and checksum verification prevent silent replacement. |
| Idempotency | Concurrent equivalent requests create one media job and one canonical artifact; changed request reuse is denied. |
| Partial-failure recovery | Ambiguous upload, missing object, orphan object, stale lease, and checksum mismatch are visible and safely reconciled. |
| Human governance | Media-quality and transcript/accessibility evidence is human-authored and bound to the exact artifact. |
| AAL2 staging | Real AAL1 denial and AAL2 success are proven for staging and revocation. |
| Staged-bundle integrity | The immutable bundle binds the exact package, artifact, evidence, configuration, and hashes. |
| Revocation | Revoked package or staged authority cannot authorize a later release. |
| Backup and restore | Encrypted object bytes and metadata restore into a disposable target with exact inventory, checksum, policy, and measured-RTO proof. |
| Observability and cost | Structured status, latency, byte counts, retries, dead letters, reconciliation, and provider-neutral cost fields are visible without private content. |
| Evidence on failure | Logs, checksums, cleanup/reconciliation state, and artifacts are preserved even when a gate fails. |
| Remote acceptance | A non-production run records exact commit, PR, environment, job, artifact, migration, object, and recovery identifiers. |
| GitHub protection | M2 checks are added to branch protection only after their names are stable and passing on `main`. |
| Owner acceptance | Neil explicitly approves the final M2 acceptance record before merge or promotion. |

## Definition of done

M2 is complete only when every acceptance gate passes on the exact protected
head; all required migrations and configuration are committed and recorded
exactly once; private media bytes and metadata restore successfully into a
disposable target; local and non-production remote evidence is committed to a
final acceptance record; all protected checks are green; failure evidence is
preserved; and the repository owner explicitly approves completion.

M2 completion still does not authorize publication, a public bucket, production
deployment, a live external provider, or changes to the current Strongr Daily
application.
